/*
 * 목록·요약 표시용 포맷 헬퍼 (5.5 / 5.11). tabular 숫자로 스캔 가능하게 (6.1.3).
 */

import { OUTPUT_EXT, type OutputFormat } from "@/core/types";
import type { ItemStatus } from "@/store/useFileStore";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** 원본 파일명의 확장자만 출력 포맷으로 바꾼다 (5.11) */
export function outputName(name: string, format: OutputFormat): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${OUTPUT_EXT[format]}`;
}

/** 이름 충돌 시 순번 부여 (5.11) */
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    return `${base} (${count + 1})${ext}`;
  });
}

/** 상태 배지 텍스트 — 색만으로 구분하지 않는다 (6.9) */
export const STATUS_LABEL: Record<ItemStatus, string> = {
  waiting: "대기",
  processing: "변환 중",
  done: "완료",
  failed: "실패",
  excluded: "제외됨",
};

export function reductionText(from: number, to: number): string {
  if (from <= 0) return "";
  const pct = Math.round((1 - to / from) * 100);
  if (pct <= 0) return `${Math.abs(pct)}% 증가`;
  return `${pct}% 감소`;
}
