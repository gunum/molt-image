"use client";

/*
 * 6.1.1 / 6.7 — FileItem 하나가 대기·처리중·완료·실패·제외 다섯 상태를 모두 표현한다.
 *
 * 테두리 (6.1.1): 대기·완료·실패·제외 → CSS border / 처리 중 → SVG 오버레이(ProgressFrame).
 * 색만으로 상태를 구분하지 않는다 — 텍스트 배지를 병기한다 (6.9).
 *
 * TODO(W4+): 항목 클릭 시 원본·결과 비교 뷰 (5.11).
 */

import {
  resolveKeepFormat,
  type OutputFormat,
  type ResizeMode,
} from "@/core/types";
import { resolveTargetSize } from "@/core/resize";
import type { FileItem as Item } from "@/store/useFileStore";
import { useFileStore } from "@/store/useFileStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { downloadItem, resultName } from "./download";
import { errorMessage } from "./messages";
import { STATUS_LABEL, formatBytes, reductionText } from "./format";
import ProgressFrame from "./ProgressFrame";
import styles from "./FileItem.module.css";

export default function FileItem({ item }: { item: Item }) {
  const removeItem = useFileStore((s) => s.removeItem);
  const retryFailed = useFileStore((s) => s.retryFailed);
  const openCompare = useFileStore((s) => s.openCompare);
  const settings = useSettingsStore((s) => s.settings);
  const keepFormat = useSettingsStore((s) => s.keepFormat);

  const vectorMode = settings.mode === "vector";
  const output: OutputFormat = keepFormat
    ? resolveKeepFormat(item.source)
    : settings.output;
  const outExt = vectorMode ? "SVG" : output.toUpperCase();

  const predicted = predictedSize(item, settings.resize);
  const comparable = item.status === "done" && !!item.result;
  const compare = comparable ? () => openCompare(item.id) : undefined;

  return (
    <li
      className={`${styles.item} ${styles[item.status]} ${
        comparable ? styles.clickable : ""
      }`}
      {...(comparable
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `${item.file.name} 원본·결과 비교`,
            onClick: compare,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                compare?.();
              }
            },
          }
        : {})}
    >
      {item.status === "processing" && <ProgressFrame ratio={item.progress} />}

      <div
        className={`${styles.thumb} ${
          item.result?.vector ? styles.thumbVector : ""
        }`}
        aria-hidden
      >
        {item.result?.vector ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.result.url} alt="" />
        ) : item.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbUrl} alt="" />
        ) : (
          <span className={styles.thumbPlaceholder}>▣</span>
        )}
        {comparable && <span className={styles.zoomBadge}>⤢</span>}
      </div>

      <div className={styles.body}>
        <p className={styles.name}>{item.file.name}</p>

        <p className={`${styles.meta} tabular`}>
          {item.status === "excluded" ? (
            <span className={styles.reason}>{item.excludeReason}</span>
          ) : item.status === "failed" ? (
            <span className={styles.reason}>
              {errorMessage(item.error).short}
            </span>
          ) : item.status === "done" && item.result ? (
            <>
              → {outExt} · {item.result.width}×{item.result.height} ·{" "}
              {formatBytes(item.result.blob.size)}
              {item.result.vector && item.result.pathCount != null && (
                <> · 조각 {item.result.pathCount}개</>
              )}
              <span className={styles.delta}>
                {" "}
                ({reductionText(item.originalSize, item.result.blob.size)})
              </span>
            </>
          ) : (
            <>
              {item.sourceWidth
                ? `${item.sourceWidth}×${item.sourceHeight} · `
                : ""}
              {formatBytes(item.originalSize)} → {outExt}
              {predicted ? ` · ${predicted}` : ""}
            </>
          )}
        </p>
        {item.animated && item.status !== "excluded" && (
          <p className={styles.note}>첫 프레임만 변환됩니다</p>
        )}
        {vectorMode &&
          (item.status === "waiting" || item.status === "processing") &&
          item.vectorSuitability === "poor" && (
            <p className={styles.reason}>사진에 가까워 결과가 부정확할 수 있습니다</p>
          )}
        {vectorMode &&
          item.status === "waiting" &&
          item.vectorSuitability === "fair" && (
            <p className={styles.note}>단순한 그림으로 바뀔 수 있습니다</p>
          )}
      </div>

      <span className={`${styles.badge} ${styles[`badge_${item.status}`]}`}>
        {STATUS_LABEL[item.status]}
      </span>

      <div
        className={styles.actions}
        onClick={(e) => e.stopPropagation()}
      >
        {item.status === "failed" && (
          <button
            type="button"
            className={styles.retry}
            onClick={retryFailed}
            aria-label={`${item.file.name} 다시 시도`}
          >
            ↻
          </button>
        )}
        {comparable && (
          <button
            type="button"
            className={styles.compare}
            onClick={compare}
            aria-label={`${item.file.name} 원본과 결과 비교`}
          >
            ⤢
          </button>
        )}
        {item.status === "done" && item.result && (
          <button
            type="button"
            className={styles.download}
            onClick={() => downloadItem(item)}
            aria-label={`${resultName(item)} 내려받기`}
          >
            ⤓
          </button>
        )}
        {item.status !== "processing" && (
          <button
            type="button"
            className={styles.remove}
            onClick={() => removeItem(item.id)}
            aria-label={`${item.file.name} 목록에서 제거`}
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

/** 5.5 예상 해상도(정확) — 예상 용량은 추정이 어려워 W4에서는 해상도만 (5.5 "약") */
function predictedSize(item: Item, resize: ResizeMode): string | null {
  if (!item.sourceWidth || !item.sourceHeight || resize.kind === "keep") {
    return null;
  }
  const t = resolveTargetSize(resize, {
    width: item.sourceWidth,
    height: item.sourceHeight,
  });
  if (t.width === item.sourceWidth && t.height === item.sourceHeight) return null;
  return `${t.width}×${t.height}`;
}
