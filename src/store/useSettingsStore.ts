/*
 * 5.6~5.8 변환 설정 · 5.12 랜딩 초기값 · 5.13 로컬 저장.
 *
 * 변환 상태가 워커·UI·다운로드에 걸쳐 공유되므로 Zustand로 관리한다 (7.1).
 *
 * localStorage (5.13) — 이미지 데이터는 어떤 경우에도 저장하지 않는다:
 *   lastSettings   포맷·크기·품질          통합 도구(/)에서만 복원
 *   metadataStrip  메타데이터 제거 여부      전 페이지 공통(개인 선호)
 */

import { create } from "zustand";
import {
  DEFAULT_VECTOR,
  type ConvertMode,
  type ConvertSettings,
  type OutputFormat,
  type QualityMode,
  type ResizeMode,
  type VectorSettings,
} from "@/core/types";

/** `/` 통합 도구 기본값 (5.12): 원본 유지 / 원본 유지 / 품질 85 */
export const DEFAULT_SETTINGS: ConvertSettings = {
  mode: "raster",
  output: "jpeg",
  resize: { kind: "keep" },
  quality: { kind: "quality", value: 85 },
  stripMetadata: true,
  vector: DEFAULT_VECTOR,
};
export const DEFAULT_KEEP_FORMAT = true; // `/` 기본은 "원본 유지"

/** 5.7 긴 변 프리셋 */
export const RESIZE_PRESETS = [1920, 1280, 800, 640] as const;
/** 5.8 목표 용량 프리셋 (bytes) */
export const TARGET_PRESETS = [
  2 * 1024 * 1024,
  1024 * 1024,
  500 * 1024,
  300 * 1024,
] as const;

const LS_LAST = "lastSettings";
const LS_STRIP = "metadataStrip";

interface Persisted {
  mode?: ConvertMode;
  output?: OutputFormat;
  keepFormat?: boolean;
  resize?: ResizeMode;
  quality?: QualityMode;
  vector?: VectorSettings;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 프라이빗 모드 등 — 무시 */
  }
}

export interface HydrateInput {
  settings: ConvertSettings;
  /** "원본 유지" 출력 (5.6). 랜딩 초기값에서 지정 */
  keepFormat?: boolean;
}

interface SettingsState {
  settings: ConvertSettings;
  /** true면 출력 포맷을 파일별 소스 포맷으로 유지한다 (5.6) */
  keepFormat: boolean;
  /** S3에서 설정 잠금 (5.2 / 6.3) */
  locked: boolean;
  /**
   * 페이지 진입 시 초기화한다.
   * @param restoreLast 통합 도구(/)면 true — lastSettings를 덮어씌운다
   */
  hydrate: (initial: HydrateInput, restoreLast: boolean) => void;
  patch: (p: Partial<ConvertSettings>) => void;
  setKeepFormat: (v: boolean) => void;
  setLocked: (v: boolean) => void;
  reset: () => void;
}

let hydratedFrom: HydrateInput = { settings: DEFAULT_SETTINGS, keepFormat: false };

function persist(settings: ConvertSettings, keepFormat: boolean): void {
  writeJSON(LS_LAST, {
    mode: settings.mode,
    output: settings.output,
    keepFormat,
    resize: settings.resize,
    quality: settings.quality,
    vector: settings.vector,
  } satisfies Persisted);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  keepFormat: false,
  locked: false,

  hydrate: (initial, restoreLast) => {
    hydratedFrom = initial;
    let next: ConvertSettings = { ...initial.settings };
    let keepFormat = initial.keepFormat ?? false;

    const savedStrip = readJSON<boolean>(LS_STRIP);
    if (typeof savedStrip === "boolean") next.stripMetadata = savedStrip;

    if (restoreLast) {
      const last = readJSON<Persisted>(LS_LAST);
      if (last) {
        next = {
          ...next,
          ...(last.mode ? { mode: last.mode } : {}),
          ...(last.output ? { output: last.output } : {}),
          ...(last.resize ? { resize: last.resize } : {}),
          ...(last.quality ? { quality: last.quality } : {}),
          ...(last.vector ? { vector: last.vector } : {}),
        };
        if (typeof last.keepFormat === "boolean") keepFormat = last.keepFormat;
      }
    }
    set({ settings: next, keepFormat, locked: false });
  },

  patch: (p) => {
    const settings = { ...get().settings, ...p };
    set({ settings });
    persist(settings, get().keepFormat);
    if (p.stripMetadata !== undefined) writeJSON(LS_STRIP, p.stripMetadata);
  },

  setKeepFormat: (v) => {
    set({ keepFormat: v });
    persist(get().settings, v);
  },

  setLocked: (v) => set({ locked: v }),
  reset: () =>
    set({
      settings: { ...hydratedFrom.settings },
      keepFormat: hydratedFrom.keepFormat ?? false,
      locked: false,
    }),
}));
