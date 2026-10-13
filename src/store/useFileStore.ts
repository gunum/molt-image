/*
 * 5.2 상태 전이 · 5.4 파일 입력 · 5.5 파일 목록 · 5.10 변환 실행 · 5.11 결과.
 *
 * FileItem 하나가 대기·처리중·완료·실패·제외 다섯 상태를 모두 표현한다 (6.7).
 * 원본 디코딩 결과는 보관하지 않는다 — 목록은 축소 썸네일만 쓴다 (7.5).
 * 결과 Blob URL은 완료 시점에 만들고, 항목 제거·초기화 때 해제한다 (7.5).
 */

import { create } from "zustand";
import { readHead, sniffFormat } from "@/core/decode";
import {
  assessVectorSuitability,
  type Suitability,
} from "@/core/suitability";
import {
  resolveKeepFormat,
  type ConvertSettings,
  type ErrorCode,
  type SourceFormat,
} from "@/core/types";
import { createRunner, type Job, type Runner } from "@/workers/pool";
import { useNoticeStore } from "./useNoticeStore";
import { useSettingsStore } from "./useSettingsStore";

export type AppState = "S0" | "S1" | "S2" | "S3" | "S4" | "S5";

export type ItemStatus =
  | "waiting"
  | "processing"
  | "done"
  | "failed"
  | "excluded";

export interface ItemResult {
  blob: Blob;
  url: string;
  mime: string;
  width: number;
  height: number;
  vector?: boolean;
  pathCount?: number;
  quality?: number;
  targetSize?: { requestedBytes: number; reached: boolean };
}

export interface FileItem {
  id: string;
  file: File;
  source: SourceFormat;
  status: ItemStatus;
  progress: number;
  originalSize: number;
  /** 원본 해상도 (5.5 예상 표시 · 5.7 혼재 감지 · 5.9 자르기). HEIC는 미확보 */
  sourceWidth?: number;
  sourceHeight?: number;
  /** 알파 채널 가능 포맷 — 투명도 손실 경고용 (5.6) */
  hasAlpha: boolean;
  /** 애니메이션 GIF/WebP — 첫 프레임만 (5.4) */
  animated: boolean;
  /** 벡터화 적합성 (8.5). HEIC 등 분석 못 한 파일은 undefined */
  vectorSuitability?: Suitability;
  thumbUrl?: string;
  /** 제외 사유 (5.4 / 5.14 L1) */
  excludeReason?: string;
  error?: ErrorCode;
  result?: ItemResult;
}

interface FileState {
  app: AppState;
  items: FileItem[];
  /** 워커 생성 실패로 메인 스레드 단일 처리 중 (5.10) */
  fallbackMode: boolean;
  runner: Runner | null;
  /** 원본·결과 비교 뷰가 열린 항목 id (5.11 / 6.3) */
  compareId: string | null;

  addFiles: (files: File[]) => Promise<void>;
  removeItem: (id: string) => void;
  clearAll: () => void;
  start: () => void;
  cancel: () => void;
  retryFailed: () => void;
  /** S4에서 설정이 바뀌면 결과를 폐기하고 S2로 되돌린다 (5.2) */
  backToReady: () => void;
  openCompare: (id: string) => void;
  closeCompare: () => void;
}

let seq = 0;

const SUPPORTED_INPUT: SourceFormat[] = [
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "heic",
  "avif",
];
const ALPHA_FORMATS: SourceFormat[] = ["png", "webp", "gif"];

/** 동시 실행 수를 제한해 대량 투입 시 메모리 스파이크를 막는다 (5.5 / 7.5) */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface Analysis {
  width?: number;
  height?: number;
  thumbUrl?: string;
  suitability?: Suitability;
  /** 디코딩 자체가 실패 — 손상 파일 (5.4) */
  broken?: boolean;
}

/**
 * 5.5 썸네일 (긴 변 160px) + 원본 해상도 + 벡터화 적합성 (8.5).
 * 원본을 전부 메모리에 올리지 않도록 한 번에 몇 장씩만 디코딩한다 (mapLimit).
 * HEIC는 여기서 디코딩하지 않는다 (libheif 비용) — 변환 시점에 검증된다.
 */
async function analyze(file: Blob, source: SourceFormat): Promise<Analysis> {
  if (source === "heic") return {};
  try {
    const full = await createImageBitmap(file);
    const width = full.width;
    const height = full.height;

    // 적합성 판정용 축소본 (긴 변 256px). 썸네일보다 조금 크게.
    const aScale = Math.min(1, 256 / Math.max(width, height));
    const aw = Math.max(1, Math.round(width * aScale));
    const ah = Math.max(1, Math.round(height * aScale));
    const aCanvas = new OffscreenCanvas(aw, ah);
    const aCtx = aCanvas.getContext("2d", { willReadFrequently: true })!;
    aCtx.drawImage(full, 0, 0, aw, ah);
    let suitability: Suitability | undefined;
    try {
      suitability = assessVectorSuitability(
        aCtx.getImageData(0, 0, aw, ah),
      ).verdict;
    } catch {
      /* 적합성 판정 실패는 무시 */
    }

    // 썸네일 (긴 변 160px)
    const scale = Math.min(1, 160 / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * scale));
    const th = Math.max(1, Math.round(height * scale));
    const canvas = new OffscreenCanvas(tw, th);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "low";
    ctx.drawImage(full, 0, 0, tw, th);
    full.close();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return {
      width,
      height,
      thumbUrl: URL.createObjectURL(blob),
      suitability,
    };
  } catch {
    return { broken: true };
  }
}

function revoke(item: FileItem): void {
  if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  if (item.result?.url) URL.revokeObjectURL(item.result.url);
}

/** 파일별로 출력 포맷·자르기를 확정해 Job을 만든다 (5.6 "원본 유지" · 5.9 자르기) */
function buildJob(item: FileItem, single: boolean): Job {
  const { settings, keepFormat } = useSettingsStore.getState();
  const output = keepFormat ? resolveKeepFormat(item.source) : settings.output;
  const resolved: ConvertSettings = {
    ...settings,
    output,
    crop: single ? settings.crop : undefined, // 자르기는 단일 파일에서만 (5.9)
  };
  return { id: item.id, file: item.file, settings: resolved };
}

/** 부분 실패 → L3 모달 (5.11 — 놓치면 파일 잃은 사실을 모른다) */
function maybePartialFailModal(items: FileItem[]): void {
  const failed = items.filter((it) => it.status === "failed");
  const done = items.filter((it) => it.status === "done");
  if (failed.length === 0) return;

  if (done.length === 0) {
    useNoticeStore.getState().pushModal(
      {
        title: "변환하지 못했습니다",
        body: "원인을 확인하고 다시 시도해 주세요.",
        list: failed.map((it) => ({
          name: it.file.name,
          reason: it.error ?? "unknown",
        })),
        actions: [
          { label: "다시 시도", value: "retry", primary: true },
          { label: "초기화", value: "reset" },
        ],
      },
      (v) => {
        if (v === "retry") useFileStore.getState().retryFailed();
        else useFileStore.getState().clearAll();
      },
    );
    return;
  }

  useNoticeStore.getState().pushModal(
    {
      title: "일부 파일을 변환하지 못했습니다",
      body: `성공 ${done.length}장 · 실패 ${failed.length}장`,
      list: failed.map((it) => ({
        name: it.file.name,
        reason: it.error ?? "unknown",
      })),
      actions: [
        { label: "완료된 파일 받기", value: "keep", primary: true },
        { label: "다시 시도", value: "retry" },
      ],
    },
    (v) => {
      if (v === "retry") useFileStore.getState().retryFailed();
    },
  );
}

export const useFileStore = create<FileState>((set, get) => ({
  app: "S0",
  items: [],
  fallbackMode: false,
  runner: null,
  compareId: null,

  openCompare: (id) => set({ compareId: id }),
  closeCompare: () => set({ compareId: null }),

  addFiles: async (files) => {
    if (files.length === 0) return;

    // S4에서 파일을 더하면 이전 결과는 폐기하고 다시 준비 상태로 (5.2)
    if (get().app === "S4") {
      set({
        items: get().items.map((it) => {
          if (it.result?.url) URL.revokeObjectURL(it.result.url);
          return it.status === "done" || it.status === "failed"
            ? { ...it, status: "waiting", progress: 0, result: undefined, error: undefined }
            : it;
        }),
      });
    }

    set({ app: "S1" });

    const analyzed = await mapLimit(files, 3, async (file) => {
      const id = `f${++seq}`;
      let source: SourceFormat = "unknown";
      try {
        source = sniffFormat(await readHead(file));
      } catch {
        /* keep unknown */
      }

      if (source === "unknown" || !SUPPORTED_INPUT.includes(source)) {
        return excludedItem(id, file, "지원하지 않는 형식");
      }

      const a = await analyze(file, source);
      if (a.broken) {
        return excludedItem(id, file, "파일을 읽을 수 없음");
      }
      return {
        id,
        file,
        source,
        status: "waiting" as ItemStatus,
        progress: 0,
        originalSize: file.size,
        sourceWidth: a.width,
        sourceHeight: a.height,
        hasAlpha: ALPHA_FORMATS.includes(source),
        animated: false, // TODO: 실제 프레임 수 검사 (5.4)
        vectorSuitability: a.suitability,
        thumbUrl: a.thumbUrl,
      } satisfies FileItem;
    });

    const items = [...get().items, ...analyzed];
    const convertible = items.some((it) => it.status !== "excluded");
    if (!convertible) {
      set({ items, app: "S5" });
      return;
    }
    set({ items, app: "S2" });
  },

  removeItem: (id) => {
    const item = get().items.find((it) => it.id === id);
    if (item) revoke(item);
    const items = get().items.filter((it) => it.id !== id);
    const compareId = get().compareId === id ? null : get().compareId;
    set(
      items.length === 0
        ? { items, app: "S0", compareId: null }
        : { items, compareId },
    );
  },

  clearAll: () => {
    get().runner?.cancel();
    get().items.forEach(revoke);
    useSettingsStore.getState().setLocked(false);
    set({
      items: [],
      app: "S0",
      runner: null,
      fallbackMode: false,
      compareId: null,
    });
  },

  start: () => {
    const items = get().items;
    const single =
      items.filter((it) => it.status !== "excluded").length === 1;
    const jobs = items
      .filter((it) => it.status === "waiting")
      .map((it) => buildJob(it, single));
    if (jobs.length === 0) return;

    useSettingsStore.getState().setLocked(true);
    set({
      app: "S3",
      items: items.map((it) =>
        it.status === "waiting" ? { ...it, progress: 0, error: undefined } : it,
      ),
    });

    const patchItem = (id: string, patch: Partial<FileItem>) =>
      set({
        items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      });

    const runner = createRunner(jobs, {
      onProgress: (id, ratio) =>
        patchItem(id, { status: "processing", progress: ratio }),
      onDone: (id, payload) => {
        patchItem(id, {
          status: "done",
          progress: 1,
          result: {
            blob: payload.blob,
            url: URL.createObjectURL(payload.blob),
            mime: payload.mime,
            width: payload.width,
            height: payload.height,
            vector: payload.vector,
            pathCount: payload.pathCount,
            quality: payload.quality,
            targetSize: payload.targetSize,
          },
        });
      },
      onError: (id, reason) =>
        patchItem(id, { status: "failed", progress: 0, error: reason as ErrorCode }),
      onSettled: () => {
        useSettingsStore.getState().setLocked(false);
        const items = get().items;
        const anyDone = items.some((it) => it.status === "done");
        const anyFail = items.some((it) => it.status === "failed");
        set({ runner: null, app: anyDone || anyFail ? "S4" : "S2" });
        maybePartialFailModal(items);
      },
    });

    set({ runner, fallbackMode: runner.fallback });
  },

  cancel: () => {
    get().runner?.cancel();
    const items = get().items.map((it) =>
      it.status === "processing"
        ? { ...it, status: "waiting" as ItemStatus, progress: 0 }
        : it,
    );
    const anyDone = items.some((it) => it.status === "done");
    set({ runner: null, items, app: anyDone ? "S4" : "S2" });
    useSettingsStore.getState().setLocked(false);
  },

  retryFailed: () => {
    set({
      items: get().items.map((it) =>
        it.status === "failed"
          ? { ...it, status: "waiting", progress: 0, error: undefined }
          : it,
      ),
      app: "S2",
    });
    get().start();
  },

  backToReady: () => {
    set({
      app: "S2",
      compareId: null,
      items: get().items.map((it) => {
        if (it.result?.url) URL.revokeObjectURL(it.result.url);
        return it.status === "done" || it.status === "failed"
          ? { ...it, status: "waiting", progress: 0, result: undefined, error: undefined }
          : it;
      }),
    });
  },
}));

function excludedItem(id: string, file: File, reason: string): FileItem {
  return {
    id,
    file,
    source: "unknown",
    status: "excluded",
    progress: 0,
    originalSize: file.size,
    hasAlpha: false,
    animated: false,
    excludeReason: reason,
  };
}
