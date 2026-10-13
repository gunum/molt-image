"use client";

/*
 * 6.1.1 처리 중 항목 전용 SVG 오버레이 — 테두리 자체가 진행률.
 *
 * - 처리 중인 항목(최대 4개)에만 붙는다. 파일 수에 비례해 비용이 늘지 않는다.
 * - viewBox는 요소의 실측 픽셀 크기로 설정한다. 고정 viewBox + preserveAspectRatio="none"은
 *   선 두께가 축마다 다르게 스케일되어 이웃 항목 여백을 침범한다 (6.1.1).
 * - 진행률은 pathLength="100"으로 정규화해 stroke-dasharray를 백분율처럼 쓴다.
 * - 크기 변화는 ResizeObserver로 관찰한다.
 * - prefers-reduced-motion이면 채우기 애니메이션(transition)을 생략한다 (6.9).
 */

import { useEffect, useRef, useState } from "react";
import styles from "./ProgressFrame.module.css";

const STROKE = 2;
const INSET = STROKE / 2;

export default function ProgressFrame({ ratio }: { ratio: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const r = host.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      // 레이아웃 전에는 0으로 측정될 수 있다 — SVG rect가 음수가 되지 않게 (STROKE 여유)
      if (w > STROKE && h > STROKE) setSize({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const pct = Math.max(0, Math.min(1, ratio)) * 100;

  return (
    <div ref={hostRef} className={styles.host} aria-hidden>
      {size && (
        <svg
          className={styles.svg}
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          {/* 아직 채워지지 않은 테두리 (점선 느낌의 옅은 실선) */}
          <rect
            x={INSET}
            y={INSET}
            width={size.w - STROKE}
            height={size.h - STROKE}
            rx={9}
            fill="none"
            stroke="var(--shell)"
            strokeWidth={STROKE}
          />
          {/* 진행률만큼 좌상단부터 시계방향으로 채워지는 테두리 */}
          <rect
            className={styles.fill}
            x={INSET}
            y={INSET}
            width={size.w - STROKE}
            height={size.h - STROKE}
            rx={9}
            fill="none"
            stroke="var(--core)"
            strokeWidth={STROKE}
            pathLength={100}
            strokeDasharray={`${pct} 100`}
          />
        </svg>
      )}
    </div>
  );
}
