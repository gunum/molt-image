"use client";

/*
 * 원본·결과 비교 뷰 (5.11 / 6.3 / 6.10 미결 2번).
 *
 * - 두 창을 나란히 놓고, 확대·이동을 양쪽이 동일 좌표로 연동한다 (5.11).
 * - 휠로 확대(1~8배), 드래그로 이동, 더블클릭으로 초기화. Esc로 닫기.
 * - 벡터 결과도 <img>로 렌더되므로 확대해도 깨지지 않는 것을 눈으로 확인할 수 있다.
 * - 모바일은 세로로 쌓는다.
 */

import { useEffect, useRef, useState } from "react";
import type { FileItem } from "@/store/useFileStore";
import { useFileStore } from "@/store/useFileStore";
import { formatBytes, reductionText } from "./format";
import styles from "./CompareDialog.module.css";

const MAX_ZOOM = 8;
const MIN_ZOOM = 1;

export default function CompareDialog({ item }: { item: FileItem }) {
  const close = useFileStore((s) => s.closeCompare);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );

  // 원본은 File을 직접 렌더 (브라우저 지원 포맷). HEIC는 썸네일로 폴백.
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  useEffect(() => {
    if (item.source === "heic" || item.source === "unknown") {
      setOriginalUrl(item.thumbUrl ?? null);
      return;
    }
    const url = URL.createObjectURL(item.file);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [item.file, item.source, item.thumbUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [close]);

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = (e: React.WheelEvent) => {
    // React의 wheel 리스너는 passive라 preventDefault를 못 한다. body가 이미
    // overflow:hidden이므로 배경 스크롤 걱정은 없다.
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z - e.deltaY * 0.003));
      if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= MIN_ZOOM) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({
      x: drag.current.px + (e.clientX - drag.current.x),
      y: drag.current.py + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  const result = item.result;
  const outLabel = result?.vector ? "SVG" : result?.mime.split("/")[1] ?? "";

  return (
    <div className={styles.overlay} onClick={close}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`${item.file.name} 원본·결과 비교`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <span className={styles.name}>{item.file.name}</span>
          <div className={styles.headActions}>
            <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={reset}>
              맞춤
            </button>
            <button type="button" onClick={close} aria-label="닫기">
              ✕
            </button>
          </div>
        </div>

        <div className={styles.panes}>
          <Pane
            label="원본"
            sub={`${item.sourceWidth ?? "?"}×${item.sourceHeight ?? "?"} · ${formatBytes(item.originalSize)}`}
            url={originalUrl}
            transform={transform}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={reset}
            grabbing={zoom > MIN_ZOOM}
          />
          <Pane
            label={`결과 · ${outLabel.toUpperCase()}`}
            sub={
              result
                ? `${result.width}×${result.height} · ${formatBytes(result.blob.size)} (${reductionText(item.originalSize, result.blob.size)})`
                : ""
            }
            url={result?.url ?? null}
            transform={transform}
            checker={result?.vector}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={reset}
            grabbing={zoom > MIN_ZOOM}
          />
        </div>
      </div>
    </div>
  );
}

function Pane({
  label,
  sub,
  url,
  transform,
  checker,
  grabbing,
  ...handlers
}: {
  label: string;
  sub: string;
  url: string | null;
  transform: string;
  checker?: boolean;
  grabbing: boolean;
  onWheel: (e: React.WheelEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <figure className={styles.pane}>
      <figcaption className={styles.paneCap}>
        <strong>{label}</strong> <span className="tabular">{sub}</span>
      </figcaption>
      <div
        className={`${styles.viewport} ${checker ? styles.checker : ""} ${
          grabbing ? styles.grab : ""
        }`}
        {...handlers}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" style={{ transform }} draggable={false} />
        ) : (
          <span className={styles.noImg}>미리보기를 만들 수 없습니다</span>
        )}
      </div>
    </figure>
  );
}
