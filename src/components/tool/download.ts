/*
 * 5.11 결과와 다운로드.
 *
 *   1장      → 개별 파일 다운로드
 *   2장 이상 → ZIP 다운로드 (기본) + 개별 다운로드 버튼 병기
 *
 * 파일명: 원본 유지, 확장자만 변경. 충돌 시 순번. ZIP: moltimage_YYYYMMDD_HHmm.zip
 * fflate는 JSZip보다 가볍고 스트리밍을 지원한다 (7.1).
 */

import { zip } from "fflate";
import { OUTPUT_EXT, type OutputFormat } from "@/core/types";
import type { FileItem } from "@/store/useFileStore";
import { dedupeNames } from "./format";

function stripExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** 결과 항목의 출력 파일명 (확장자만 교체). keepFormat이면 결과 blob의 타입으로 판단 */
export function resultName(item: FileItem): string {
  const ext = extFromBlobType(item.result?.blob.type) ?? "bin";
  return `${stripExt(item.file.name)}.${ext}`;
}

function extFromBlobType(type?: string): string | undefined {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
  };
  return type ? map[type.split(";")[0]] : undefined;
}

/** 브라우저 다운로드를 트리거한다. blob URL은 직후 해제한다 (7.5) */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 단일 결과 항목 다운로드 */
export function downloadItem(item: FileItem): void {
  if (!item.result) return;
  triggerDownload(item.result.blob, resultName(item));
}

/** 예상 출력 확장자 (예상 표시용, 아직 결과가 없을 때) */
export function expectedExt(output: OutputFormat): string {
  return OUTPUT_EXT[output];
}

function zipStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(
    d.getHours(),
  )}${p(d.getMinutes())}`;
}

/** 완료된 항목들을 ZIP으로 묶어 다운로드한다 (5.11) */
export async function downloadZip(items: FileItem[]): Promise<void> {
  const done = items.filter((it) => it.status === "done" && it.result);
  if (done.length === 0) return;

  const names = dedupeNames(done.map((it) => resultName(it)));
  const entries: Record<string, Uint8Array> = {};
  await Promise.all(
    done.map(async (it, i) => {
      entries[names[i]] = new Uint8Array(await it.result!.blob.arrayBuffer());
    }),
  );

  const packed: Uint8Array = await new Promise((resolve, reject) => {
    // level 0 — 이미 압축된 이미지라 재압축 이득이 없고 CPU만 쓴다
    zip(entries, { level: 0 }, (err, data) =>
      err ? reject(err) : resolve(data),
    );
  });

  triggerDownload(
    new Blob([packed], { type: "application/zip" }),
    `moltimage_${zipStamp()}.zip`,
  );
}
