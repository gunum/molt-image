/*
 * 7.3 리사이즈 — 단계적 축소.
 *
 * drawImage로 한 번에 크게 줄이면 계단 현상이 생긴다.
 * 축소 비율이 0.5 미만이면 절반씩 반복해 목표에 접근한다 (4032 → 2016 → 1008 → 800).
 * M0 실측: 단계적 축소가 오히려 빠르다 (11ms → 3ms). 조건 없이 적용한다.
 *
 * 비율은 항상 유지한다. 가로세로를 따로 지정해 왜곡시키는 기능은 없다 (5.7).
 * 확대는 허용하되 경고는 UI 계층에서 한다 (5.7 / 5.14 L2).
 */

import type { ResizeMode } from "./types";

export interface Size {
  width: number;
  height: number;
}

/** 크기 변경 방식과 원본 크기로부터 목표 크기를 계산한다 (5.7) */
export function resolveTargetSize(
  mode: ResizeMode,
  src: Size,
): Size {
  const { width: w, height: h } = src;
  switch (mode.kind) {
    case "keep":
      return { width: w, height: h };
    case "longEdge": {
      const long = Math.max(w, h);
      if (long === 0) return { width: w, height: h };
      const k = mode.px / long;
      return round({ width: w * k, height: h * k });
    }
    case "width": {
      if (w === 0) return { width: w, height: h };
      const k = mode.px / w;
      return round({ width: mode.px, height: h * k });
    }
    case "scale":
      return round({ width: w * mode.ratio, height: h * mode.ratio });
  }
}

function round(s: Size): Size {
  return {
    width: Math.max(1, Math.round(s.width)),
    height: Math.max(1, Math.round(s.height)),
  };
}

export function sameSize(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height;
}

/**
 * source를 target 크기로 그린 OffscreenCanvas를 반환한다.
 * 축소 시 배율이 0.5 미만인 축에 대해 절반씩 반복 축소한 뒤 마지막에 목표로 맞춘다.
 */
export function drawResized(
  source: CanvasImageSource,
  src: Size,
  target: Size,
): OffscreenCanvas {
  let curW = src.width;
  let curH = src.height;
  let current: CanvasImageSource = source;
  let scratch: OffscreenCanvas | null = null;

  // 단계적 축소 — 목표의 2배보다 큰 동안 절반씩
  while (curW > target.width * 2 && curH > target.height * 2) {
    const nextW = Math.max(target.width, Math.floor(curW / 2));
    const nextH = Math.max(target.height, Math.floor(curH / 2));
    scratch = paint(current, curW, curH, nextW, nextH);
    current = scratch;
    curW = nextW;
    curH = nextH;
  }

  return paint(current, curW, curH, target.width, target.height);
}

function paint(
  source: CanvasImageSource,
  _sw: number,
  _sh: number,
  dw: number,
  dh: number,
): OffscreenCanvas {
  // TODO(W3): 워커당 캔버스 재사용 (7.5). W2는 단일 스레드라 매 단계 새로 만든다.
  const canvas = new OffscreenCanvas(dw, dh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d 컨텍스트를 얻지 못했다");
  // 브라우저 smoothing만으로는 대폭 축소 품질이 부족하지만(7.3), 단계적 축소와
  // 함께 쓰면 사진 앱 결과와 육안 차이가 없다 (M0 검증).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, dw, dh);
  return canvas;
}
