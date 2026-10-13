/*
 * 7.3 변환 파이프라인 조립 (+ 7.10 Phase 2 벡터화 분기).
 *
 * File
 *  ├─ 1. 포맷 판별      매직 넘버 (decode.sniffFormat)
 *  ├─ 2. 메타데이터 추출  원본 EXIF(APP1) 확보 — stripMetadata=false 대비
 *  ├─ 3. 디코딩          → ImageBitmap (회전은 여기서 픽셀에 반영됨, 7.3/metadata.ts)
 *  ├─ 4. 회전 보정       3에서 처리됨
 *  ├─ 5. 자르기          단일 파일에서만 (settings.crop)
 *  ├─ 6. 리사이즈        단계적 축소
 *  ├─ 7a. (raster) 인코딩   품질 적용 또는 목표 용량 이진 탐색 → Blob
 *  │   8.  메타데이터 처리  제거(기본) 또는 원본 APP1 재삽입
 *  └─ 7b. (vector) 벡터화   래스터화 → VTracer → SVG Blob (품질/메타데이터 무관)
 *
 * 순서 규칙 (7.3): 회전 보정 → 자르기 → 리사이즈. 벡터화도 이 순서 뒤에 온다.
 * 진행률 (7.4): 디코딩 40% / 리사이즈 60% / 인코딩·벡터화 100%.
 */

import { removeConnectedBackground } from "./background";
import { clampCrop, drawCropped } from "./crop";
import { decode, readHead, sniffFormat } from "./decode";
import { encode, type EncodeSource } from "./encode";
import { extractExifSegment, reattachExif } from "./metadata";
import { drawResized, resolveTargetSize, sameSize, type Size } from "./resize";
import { searchQualityForTargetSize } from "./targetSize";
import { upscaleImage } from "./upscale";
import { vectorize } from "./vectorize";
import {
  DEFAULT_UPSCALE,
  DEFAULT_VECTOR,
  OUTPUT_MIME,
  PipelineError,
  isOpaqueFormat,
  usesQuality,
  type ConvertResult,
  type ConvertSettings,
} from "./types";

export interface RunOptions {
  onProgress?: (ratio: number) => void;
}

export async function runPipeline(
  file: Blob,
  settings: ConvertSettings,
  { onProgress }: RunOptions = {},
): Promise<ConvertResult> {
  const report = onProgress ?? (() => {});

  // 1. 포맷 판별
  const head = await readHead(file, 64);
  const source = sniffFormat(head.subarray(0, 12));
  if (source === "unknown") throw new PipelineError("unsupported-format");

  // 2. 메타데이터 추출 — 원본 유지 모드에서만 필요 (벡터화는 해당 없음)
  const wantExif =
    settings.mode !== "vector" && !settings.stripMetadata && source === "jpeg";
  const exifSegment = wantExif
    ? extractExifSegment(new Uint8Array(await file.arrayBuffer()))
    : null;

  // 3. 디코딩 (+ 4. 회전 보정)
  const bitmap = await decode(file, source);
  report(0.4);

  let stage: CanvasImageSource = bitmap;
  let size: Size = { width: bitmap.width, height: bitmap.height };

  try {
    // 5. 자르기
    if (settings.crop) {
      const rect = clampCrop(settings.crop, size);
      if (!rect) throw new PipelineError("unknown", "자르기 영역이 너무 작습니다");
      stage = drawCropped(stage, rect);
      size = { width: rect.width, height: rect.height };
    }

    // 6. 리사이즈
    const target = resolveTargetSize(settings.resize, size);
    if (!sameSize(target, size)) {
      stage = drawResized(stage, size, target);
      size = target;
    }
    report(0.6);

    // 7b. 벡터화 분기
    if (settings.mode === "vector") {
      const vec = settings.vector ?? DEFAULT_VECTOR;
      const pixels = readPixels(stage, size);
      // 배경 제거 — 벡터화 전에 테두리와 연결된 배경을 투명하게 (background.ts)
      if (vec.removeBackground) {
        removeConnectedBackground(pixels, vec.bgTolerance);
      }
      report(0.7);
      const svg = await vectorize(
        new Uint8Array(pixels.data.buffer),
        size.width,
        size.height,
        vec,
      );
      report(1);
      return {
        blob: new Blob([svg], { type: "image/svg+xml" }),
        mime: "image/svg+xml",
        width: size.width,
        height: size.height,
        vector: true,
        pathCount: (svg.match(/<path[\s/>]/g) ?? []).length,
      };
    }

    // 7c. 업스케일 분기 (Phase 3) — 타일 분할 + 타일 단위 진행률
    if (settings.mode === "upscale") {
      const up = settings.upscale ?? DEFAULT_UPSCALE;
      const src = readPixels(stage, size);
      report(0.6);

      // 추론(타일 반복)이 이 단계의 대부분 — 0.6 ~ 0.95 를 타일 진행률로 채운다
      const result = await upscaleImage(src, up, (r) =>
        report(0.6 + 0.35 * r),
      );
      report(0.96);

      const outImage = pixelsToCanvas(result.data, result.width, result.height);
      const upFormat = settings.output;
      const upQuality =
        settings.quality.kind === "quality" && usesQuality(upFormat)
          ? settings.quality.value
          : undefined;
      const blob = await encode(
        { image: outImage, width: result.width, height: result.height },
        upFormat,
        { quality: upQuality, background: settings.background },
      );
      report(1);

      return {
        blob,
        mime: OUTPUT_MIME[upFormat],
        width: result.width,
        height: result.height,
        upscaled: true,
        scale: up.scale,
        tiles: result.tiles,
        keptAlpha: result.hadAlpha && !isOpaqueFormat(upFormat),
      };
    }

    // 7a. 래스터 인코딩
    const encSource: EncodeSource = {
      image: stage,
      width: size.width,
      height: size.height,
    };
    const format = settings.output;
    const q = settings.quality;

    let blob: Blob;
    let usedQuality: number | undefined;
    let targetSize: ConvertResult["targetSize"];

    if (q.kind === "targetSize" && usesQuality(format)) {
      const result = await searchQualityForTargetSize(
        (quality) =>
          encode(encSource, format, { quality, background: settings.background }),
        q.bytes,
        (r) => report(0.6 + 0.4 * r),
      );
      blob = result.blob;
      usedQuality = result.quality;
      targetSize = { requestedBytes: q.bytes, reached: result.reached };
    } else {
      const quality =
        q.kind === "quality" && usesQuality(format) ? q.value : undefined;
      blob = await encode(encSource, format, {
        quality,
        background: settings.background,
      });
      usedQuality = quality;
      report(1);
    }

    // 8. 메타데이터 처리
    if (!settings.stripMetadata) blob = await reattachExif(blob, exifSegment);
    report(1);

    return {
      blob,
      mime: OUTPUT_MIME[format],
      width: size.width,
      height: size.height,
      quality: usedQuality,
      targetSize,
    };
  } finally {
    bitmap.close();
  }
}

/** stage(ImageBitmap/OffscreenCanvas)를 RGBA8 ImageData로 읽는다 (벡터화·업스케일 입력) */
function readPixels(source: CanvasImageSource, size: Size): ImageData {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new PipelineError("vectorize-failed", "2d 컨텍스트 없음");
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return ctx.getImageData(0, 0, size.width, size.height);
}

/** RGBA8 버퍼를 OffscreenCanvas 로 되돌린다 (업스케일 결과 인코딩 입력) */
function pixelsToCanvas(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PipelineError("upscale-failed", "2d 컨텍스트 없음");
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas;
}
