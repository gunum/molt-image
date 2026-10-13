"use client";

/*
 * 시작 · 취소 · 새로 시작 (6.7 PrimaryAction).
 *
 * - S2: 라벨이 현재 설정을 반영한다 — `JPG로 변환 (3장)` / `크기만 변경 (5장)` (6.3 / 5.12).
 * - S3: 같은 자리가 취소 버튼으로 바뀐다 (6.3).
 * - S4: 새로 시작.
 */

import { OUTPUT_EXT, type OutputFormat } from "@/core/types";
import { useFileStore } from "@/store/useFileStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import styles from "./PrimaryAction.module.css";

export default function PrimaryAction({
  autoFocus = false,
}: {
  autoFocus?: boolean;
}) {
  const app = useFileStore((s) => s.app);
  const start = useFileStore((s) => s.start);
  const cancel = useFileStore((s) => s.cancel);
  const clearAll = useFileStore((s) => s.clearAll);
  const count = useFileStore(
    (s) => s.items.filter((it) => it.status !== "excluded").length,
  );
  const output = useSettingsStore((s) => s.settings.output);
  const keepFormat = useSettingsStore((s) => s.keepFormat);
  const resizes = useSettingsStore((s) => s.settings.resize.kind !== "keep");
  const isVector = useSettingsStore((s) => s.settings.mode === "vector");

  if (app === "S3") {
    return (
      <button type="button" className={styles.secondary} onClick={cancel}>
        취소
      </button>
    );
  }
  if (app === "S4") {
    return (
      <button type="button" className={styles.secondary} onClick={clearAll}>
        새로 시작
      </button>
    );
  }
  return (
    <button
      type="button"
      data-role="start"
      className={styles.primary}
      disabled={count === 0}
      onClick={start}
      autoFocus={autoFocus}
    >
      {label({ isVector, keepFormat, output, resizes, count })}
    </button>
  );
}

function label({
  isVector,
  keepFormat,
  output,
  resizes,
  count,
}: {
  isVector: boolean;
  keepFormat: boolean;
  output: OutputFormat;
  resizes: boolean;
  count: number;
}): string {
  if (isVector) return `SVG로 변환 (${count}장)`;
  if (keepFormat) {
    return resizes ? `크기만 변경 (${count}장)` : `변환 (${count}장)`;
  }
  return `${OUTPUT_EXT[output].toUpperCase()}로 변환 (${count}장)`;
}
