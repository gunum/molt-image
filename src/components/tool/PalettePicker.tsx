"use client";

/*
 * 고정 팔레트 지정 (일정 8.5 W3 — 참고: kwak 버전의 "수동 색 선택").
 *
 * 원본 이미지에서 스포이드로 색을 뽑거나 색상 선택기로 직접 더한다.
 * VTracer의 palette 옵션에 그대로 전달돼, 결과 SVG는 이 색들만 쓴다.
 * 브랜드 색이 정해진 로고를 벡터화할 때 유용하다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { decode } from "@/core/decode";
import type { SourceFormat } from "@/core/types";
import styles from "./PalettePicker.module.css";

const MAX_PALETTE = 12;

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
      .join("")
  );
}

export default function PalettePicker({
  file,
  source,
  palette,
  onChange,
  onClose,
}: {
  file: File;
  source: SourceFormat;
  palette: string[];
  onChange: (palette: string[]) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<ImageData | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("#135e52");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bmp = await decode(file, source);
        if (cancelled) {
          bmp.close();
          return;
        }
        const maxSide = 520;
        const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
        const w = Math.max(1, Math.round(bmp.width * scale));
        const h = Math.max(1, Math.round(bmp.height * scale));
        const canvas = canvasRef.current!;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0, w, h);
        bmp.close();
        dataRef.current = ctx.getImageData(0, 0, w, h);
        setReady(true);
      } catch {
        if (!cancelled) setError("이미지를 불러오지 못했습니다");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const add = useCallback(
    (hex: string) => {
      const h = hex.toLowerCase();
      if (palette.includes(h) || palette.length >= MAX_PALETTE) return;
      onChange([...palette, h]);
    },
    [palette, onChange],
  );

  const sample = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const img = dataRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * img.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * img.height);
    const i = (y * img.width + x) * 4;
    if (img.data[i + 3] < 8) return; // 투명 픽셀은 무시
    add(toHex(img.data[i], img.data[i + 1], img.data[i + 2]));
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="팔레트 색 지정"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <strong>팔레트 색 지정</strong>
          <button type="button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className={styles.stage}>
          {error ? (
            <p className={styles.error}>{error}</p>
          ) : (
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              onClick={sample}
              style={{ cursor: ready ? "crosshair" : "wait" }}
            />
          )}
          <p className={styles.hint}>이미지를 클릭해 색을 뽑으세요</p>
        </div>

        <div className={styles.controls}>
          <div className={styles.swatches}>
            {palette.length === 0 && (
              <span className={styles.empty}>지정한 색 없음 (자동)</span>
            )}
            {palette.map((c) => (
              <button
                key={c}
                type="button"
                className={styles.swatch}
                style={{ background: c }}
                title={`${c} 제거`}
                onClick={() => onChange(palette.filter((x) => x !== c))}
              >
                <span aria-hidden>✕</span>
              </button>
            ))}
          </div>

          <div className={styles.addRow}>
            <input
              type="color"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              aria-label="색 직접 선택"
            />
            <button type="button" onClick={() => add(manual)}>
              색 추가
            </button>
            {palette.length > 0 && (
              <button
                type="button"
                className={styles.clear}
                onClick={() => onChange([])}
              >
                비우기
              </button>
            )}
            <span className={styles.spacer} />
            <button
              type="button"
              className={styles.done}
              onClick={onClose}
            >
              완료
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
