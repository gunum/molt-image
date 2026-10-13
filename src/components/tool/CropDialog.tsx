"use client";

/*
 * 자르기 (5.9 / 6.4).
 *
 * - 단일 파일에서만. 전체화면 모달(모바일 인라인 불가, 6.4).
 * - 드래그로 이동, 모서리 핸들로 조정, 수치 직접 입력(X/Y/W/H), 비율 프리셋, 초기화.
 * - 자르기 영역은 원본 해상도 기준으로 저장한다 — 미리보기 배율과 무관 (5.9).
 * - 자른 영역이 10px 미만이면 적용을 막는다 (5.9 / MIN_CROP_PX).
 * - 자르기 → 리사이즈 순으로 처리된다 (7.3, 파이프라인에서).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { decode } from "@/core/decode";
import { MIN_CROP_PX } from "@/core/crop";
import type { CropRect, SourceFormat } from "@/core/types";
import styles from "./CropDialog.module.css";

const RATIOS: { label: string; value: number | null }[] = [
  { label: "자유", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:4", value: 3 / 4 },
  { label: "9:16", value: 9 / 16 },
];

type Corner = "nw" | "ne" | "sw" | "se";
interface Drag {
  mode: "move" | "resize";
  corner?: Corner;
  startX: number;
  startY: number;
  rect: CropRect;
}

export default function CropDialog({
  file,
  source,
  initial,
  onApply,
  onCancel,
}: {
  file: File;
  source: SourceFormat;
  initial?: CropRect;
  onApply: (rect: CropRect | undefined) => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState<{ url: string; w: number; h: number } | null>(
    null,
  );
  const [rect, setRect] = useState<CropRect | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  // 소스를 표시용으로 디코딩 (HEIC 포함 — core/decode 재사용)
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const bmp = await decode(file, source);
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        canvas.getContext("2d")!.drawImage(bmp, 0, 0);
        const w = bmp.width;
        const h = bmp.height;
        bmp.close();
        const blob = await canvas.convertToBlob({ type: "image/png" });
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPreview({ url, w, h });
        setRect(initial ?? { x: 0, y: 0, width: w, height: h });
      } catch {
        if (!cancelled) setError("이미지를 불러오지 못했습니다");
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, source, initial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onCancel]);

  const scale = useCallback(() => {
    const el = imgWrapRef.current;
    if (!el || !preview) return 1;
    return el.clientWidth / preview.w;
  }, [preview]);

  const clampRect = useCallback(
    (r: CropRect): CropRect => {
      if (!preview) return r;
      let { x, y, width, height } = r;
      width = Math.max(MIN_CROP_PX, Math.min(width, preview.w));
      height = Math.max(MIN_CROP_PX, Math.min(height, preview.h));
      x = Math.max(0, Math.min(x, preview.w - width));
      y = Math.max(0, Math.min(y, preview.h - height));
      return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    },
    [preview],
  );

  const applyRatio = useCallback(
    (r: CropRect, ratioVal: number | null): CropRect => {
      if (!ratioVal || !preview) return r;
      // width 기준으로 height를 맞춘다
      const height = r.width / ratioVal;
      return clampRect({ ...r, height });
    },
    [preview, clampRect],
  );

  const beginDrag = (
    e: React.PointerEvent,
    mode: "move" | "resize",
    corner?: Corner,
  ) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (rect) dragRef.current = { mode, corner, startX: e.clientX, startY: e.clientY, rect };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !preview) return;
    const s = scale();
    const dx = (e.clientX - drag.startX) / s;
    const dy = (e.clientY - drag.startY) / s;

    if (drag.mode === "move") {
      setRect(clampRect({ ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy }));
      return;
    }
    const c = drag.corner!;
    const r = { ...drag.rect };
    if (c.includes("e")) r.width = drag.rect.width + dx;
    if (c.includes("s")) r.height = drag.rect.height + dy;
    if (c.includes("w")) {
      r.x = drag.rect.x + dx;
      r.width = drag.rect.width - dx;
    }
    if (c.includes("n")) {
      r.y = drag.rect.y + dy;
      r.height = drag.rect.height - dy;
    }
    setRect(applyRatio(clampRect(r), ratio));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const setField = (key: keyof CropRect, value: number) => {
    if (!rect) return;
    setRect(applyRatio(clampRect({ ...rect, [key]: value }), ratio));
  };

  const pickRatio = (v: number | null) => {
    setRatio(v);
    if (rect) setRect(applyRatio(rect, v));
  };

  const reset = () => {
    if (preview) setRect({ x: 0, y: 0, width: preview.w, height: preview.h });
    setRatio(null);
  };

  const tooSmall =
    !rect || rect.width < MIN_CROP_PX || rect.height < MIN_CROP_PX;

  const apply = () => {
    if (!rect || !preview) return;
    const full =
      rect.x === 0 &&
      rect.y === 0 &&
      rect.width === preview.w &&
      rect.height === preview.h;
    onApply(full ? undefined : rect);
  };

  const s = scale();

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="자르기">
        <div className={styles.stage}>
          {error && <p className={styles.error}>{error}</p>}
          {preview && rect && (
            <div
              ref={imgWrapRef}
              className={styles.imgWrap}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt="" draggable={false} />
              <div className={styles.shade} />
              <div
                className={styles.selection}
                style={{
                  left: rect.x * s,
                  top: rect.y * s,
                  width: rect.width * s,
                  height: rect.height * s,
                }}
                onPointerDown={(e) => beginDrag(e, "move")}
              >
                {(["nw", "ne", "sw", "se"] as const).map((c) => (
                  <span
                    key={c}
                    className={`${styles.handle} ${styles[`h_${c}`]}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      beginDrag(e, "resize", c);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.controls}>
          <div className={styles.ratios}>
            {RATIOS.map((r) => (
              <button
                key={r.label}
                type="button"
                className={ratio === r.value ? styles.ratioOn : styles.ratio}
                onClick={() => pickRatio(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>

          {rect && (
            <div className={styles.fields}>
              {(["x", "y", "width", "height"] as const).map((k) => (
                <label key={k}>
                  {k === "width" ? "W" : k === "height" ? "H" : k.toUpperCase()}
                  <input
                    type="number"
                    value={rect[k]}
                    min={0}
                    onChange={(e) => setField(k, Math.round(+e.target.value))}
                  />
                </label>
              ))}
            </div>
          )}

          <div className={styles.buttons}>
            <button type="button" className={styles.text} onClick={reset}>
              초기화
            </button>
            <span className={styles.spacer} />
            <button type="button" className={styles.text} onClick={onCancel}>
              취소
            </button>
            <button
              type="button"
              className={styles.apply}
              disabled={tooSmall}
              onClick={apply}
            >
              적용
            </button>
          </div>
          {tooSmall && (
            <p className={styles.hint}>
              자를 영역이 너무 작습니다 ({MIN_CROP_PX}px 이상)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
