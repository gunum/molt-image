/*
 * 5.9 / 7.3 자르기.
 *
 * 회전 보정이 자르기보다 앞, 자르기가 리사이즈보다 앞 (7.3).
 * 자르기 영역은 원본(회전 보정 후) 해상도 기준이다 — 미리보기 배율과 무관 (5.9).
 * 자른 영역이 10px 미만이면 실행을 막는다 (5.9).
 *
 * 단일 파일에서만 적용된다. 그 판정과 UI(CropDialog)는 W4에서 연결한다.
 */

import { PipelineError, type CropRect } from "./types";
import type { Size } from "./resize";

export const MIN_CROP_PX = 10;

/** 자르기 영역을 이미지 경계 안으로 정규화한다. 유효하지 않으면 null */
export function clampCrop(rect: CropRect, bounds: Size): CropRect | null {
  const x = Math.max(0, Math.min(Math.round(rect.x), bounds.width));
  const y = Math.max(0, Math.min(Math.round(rect.y), bounds.height));
  const width = Math.round(Math.min(rect.width, bounds.width - x));
  const height = Math.round(Math.min(rect.height, bounds.height - y));
  if (width < MIN_CROP_PX || height < MIN_CROP_PX) return null;
  return { x, y, width, height };
}

/** source에서 rect 영역만 잘라낸 OffscreenCanvas를 반환한다 */
export function drawCropped(
  source: CanvasImageSource,
  rect: CropRect,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(rect.width, rect.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PipelineError("encode-failed", "2d 컨텍스트를 얻지 못했다");
  ctx.drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );
  return canvas;
}
