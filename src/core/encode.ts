/*
 * 7.3 인코딩.
 *
 * OffscreenCanvas.convertToBlob({ type, quality }) 를 사용한다.
 *
 * | 출력 | MIME        | 품질 |
 * |------|-------------|------|
 * | JPEG | image/jpeg  | 적용 |
 * | WebP | image/webp  | 적용 |
 * | PNG  | image/png   | 없음 |
 * | BMP  | image/bmp   | 없음 |
 */

import {
  OUTPUT_MIME,
  PipelineError,
  isOpaqueFormat,
  usesQuality,
  type OutputFormat,
} from "./types";

// TODO(W3): OffscreenCanvas는 워커당 하나를 재사용한다 (7.5). 파일마다 생성하지 않는다.
// W2는 단일 스레드라 모듈 캔버스 하나를 재사용한다.
let sharedCanvas: OffscreenCanvas | null = null;

function getCanvas(width: number, height: number): OffscreenCanvas {
  if (!sharedCanvas) {
    sharedCanvas = new OffscreenCanvas(width, height);
  } else {
    sharedCanvas.width = width;
    sharedCanvas.height = height;
  }
  return sharedCanvas;
}

export interface EncodeSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export interface EncodeOptions {
  /** 1~100 (7.3). jpeg/webp에만 적용 */
  quality?: number;
  /** 투명도 손실 시 채울 배경색 (5.6). 기본 흰색 */
  background?: string;
}

/**
 * 이미지 소스를 지정 포맷의 Blob으로 인코딩한다.
 * 회전 보정·자르기·리사이즈는 상위 단계에서 이미 끝난 상태로 들어온다 (7.3).
 */
export async function encode(
  src: EncodeSource,
  format: OutputFormat,
  opts: EncodeOptions = {},
): Promise<Blob> {
  const canvas = getCanvas(src.width, src.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PipelineError("encode-failed", "2d 컨텍스트를 얻지 못했다");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (isOpaqueFormat(format)) {
    // 알파가 없는 포맷 — 투명 픽셀을 배경색으로 (5.6)
    ctx.fillStyle = opts.background ?? "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(src.image, 0, 0, canvas.width, canvas.height);

  const params: ImageEncodeOptions = { type: OUTPUT_MIME[format] };
  if (usesQuality(format) && opts.quality != null) {
    params.quality = clamp(opts.quality, 1, 100) / 100;
  }

  let blob: Blob;
  try {
    blob = await canvas.convertToBlob(params);
  } catch (err) {
    throw new PipelineError(
      "encode-failed",
      err instanceof Error ? err.message : undefined,
    );
  }

  // 브라우저가 요청 타입을 지원하지 않으면 다른 타입으로 폴백한다 (7.12 — BMP 등)
  if (blob.type !== OUTPUT_MIME[format]) {
    throw new PipelineError(
      "encode-failed",
      `${format} 인코딩을 지원하지 않는 브라우저`,
    );
  }
  return blob;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
