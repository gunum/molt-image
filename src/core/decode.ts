/*
 * 7.3 포맷 판별 + 디코딩 분기 · 7.6 HEIC 지연 로딩.
 *
 * 확장자를 믿지 않는다. `.jpg`로 저장된 HEIC 파일이 흔하다.
 * 파일 앞 12바이트를 읽어 매직 넘버로 판별한다 (7.3).
 */

import { PipelineError, type SourceFormat } from "./types";

/** 파일 앞부분 바이트로 포맷을 판별한다 (7.3 포맷 판별 표) */
export function sniffFormat(head: Uint8Array): SourceFormat {
  const b = head;
  const at = (i: number, ...bytes: number[]) =>
    bytes.every((v, k) => b[i + k] === v);

  // JPEG: FF D8 FF
  if (at(0, 0xff, 0xd8, 0xff)) return "jpeg";
  // PNG: 89 50 4E 47
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "png";
  // GIF: 47 49 46 38
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "gif";
  // BMP: 42 4D
  if (at(0, 0x42, 0x4d)) return "bmp";
  // RIFF....WEBP
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50))
    return "webp";

  // ISO-BMFF: offset 4에 'ftyp' + 브랜드 확인 (HEIC/HEIF/AVIF)
  if (at(4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand.startsWith("avif") || brand === "avis") return "avif";
    if (brand.startsWith("hei") || brand === "mif1" || brand === "msf1")
      return "heic";
    return "heic"; // 대부분의 ftyp 이미지 컨테이너는 HEIF 계열
  }

  return "unknown";
}

/** Blob 앞 N바이트를 읽는다 */
export async function readHead(file: Blob, bytes = 12): Promise<Uint8Array> {
  const slice = file.slice(0, bytes);
  return new Uint8Array(await slice.arrayBuffer());
}

// ── 7.6 HEIC 지연 로딩 ────────────────────────────────────────────────
// libheif WASM은 1~2MB다. 초기 번들에 넣지 않고, HEIC가 감지될 때 동적 import 한다.
// 판별과 동시에 로딩을 시작하므로 사용자가 설정을 만지는 동안 백그라운드에서 받아진다.
// 로딩 실패 시 3회까지 재시도, 이후 L3 모달 (5.14 / 7.6).
//
// TODO(W3): WASM 인스턴스는 워커마다 별도로 만들어야 한다. 컴파일된 Module을
//   메인에서 한 번 만들어 각 워커로 구조화 복제 전달한다 (7.6 워커에서의 로딩).
// TODO(W5): 7.7 / 7.12 — .wasm을 콘텐츠 해시가 붙은 별도 파일로 분리해 배포한다
//   (LGPL 교체 가능성 + 무기한 캐시). 현재는 wasm-bundle(인라인)로 동작만 확인.

interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(
    image: ImageData,
    cb: (data: ImageData | null) => void,
  ): void;
  free?(): void;
}
interface HeifDecoder {
  decode(buffer: Uint8Array): HeifImage[];
}
interface LibHeif {
  HeifDecoder: new () => HeifDecoder;
}

const HEIF_RETRY_LIMIT = 3;
let heifPromise: Promise<LibHeif> | null = null;

async function importLibHeif(): Promise<LibHeif> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= HEIF_RETRY_LIMIT; attempt++) {
    try {
      // ESM 번들(.mjs) — 팩토리를 호출하면 컴파일된 Module을 동기 반환한다.
      const mod = await import("libheif-js/libheif-wasm/libheif-bundle.mjs");
      const lib = mod.default() as unknown as LibHeif;
      if (typeof lib.HeifDecoder !== "function") {
        throw new Error("libheif 모듈 형태가 예상과 다르다");
      }
      return lib;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new PipelineError(
    "heic-module-failed",
    lastErr instanceof Error ? lastErr.message : undefined,
  );
}

/** libheif 로딩을 시작(또는 진행 중인 것을 반환)한다. 결과는 캐시된다. */
export function loadHeif(): Promise<LibHeif> {
  if (!heifPromise) {
    heifPromise = importLibHeif().catch((err) => {
      heifPromise = null; // 실패는 캐시하지 않는다 — 다음 시도에서 다시 받는다
      throw err;
    });
  }
  return heifPromise;
}

/**
 * `/heic-to-jpg` 랜딩 진입 시 미리 호출한다 (7.6). 이 페이지 방문자는
 * HEIC를 올릴 것이 거의 확실하다. 실패는 조용히 무시하고, 실제 변환 시 재시도된다.
 */
export function preloadHeif(): void {
  void loadHeif().catch(() => {});
}

async function decodeHeic(blob: Blob): Promise<ImageBitmap> {
  const lib = await loadHeif();
  const bytes = new Uint8Array(await blob.arrayBuffer());

  let images: HeifImage[];
  try {
    images = new lib.HeifDecoder().decode(bytes);
  } catch (err) {
    throw new PipelineError(
      "decode-failed",
      err instanceof Error ? err.message : undefined,
    );
  }
  if (!images || images.length === 0) {
    throw new PipelineError("decode-failed", "HEIC에서 이미지를 찾지 못했다");
  }

  // 애니메이션/버스트 HEIC는 첫 프레임만 (5.4)
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const out = new ImageData(width, height);

  try {
    await new Promise<void>((resolve, reject) => {
      image.display(out, (data) => {
        if (data) resolve();
        else reject(new PipelineError("decode-failed", "HEIC 디코딩 실패"));
      });
    });
  } finally {
    image.free?.();
  }

  // libheif는 irot/imir 변환 속성을 디코딩 시 반영한다.
  // TODO(W5): 실제 아이폰 세로 HEIC(EXIF Orientation)로 회전 결과 검증 (8.2 실기기 확인).
  return createImageBitmap(out);
}

export interface DecodeOptions {
  /** 썸네일 등 축소 디코딩 (5.5). 미지정 시 원본 해상도 */
  resizeWidth?: number;
  resizeQuality?: ImageBitmapOptions["resizeQuality"];
}

/**
 * 디코딩 분기 (7.3):
 *   HEIC?  ─ yes ─► libheif WASM ─► ImageData ─► ImageBitmap
 *          └ no  ─► createImageBitmap(file)   (EXIF 회전은 from-image로 픽셀에 반영)
 */
export async function decode(
  file: Blob,
  format: SourceFormat,
  opts: DecodeOptions = {},
): Promise<ImageBitmap> {
  if (format === "unknown") {
    throw new PipelineError("unsupported-format");
  }

  if (format === "heic") {
    return decodeHeic(file);
  }

  try {
    const bitmapOpts: ImageBitmapOptions = { imageOrientation: "from-image" };
    if (opts.resizeWidth) {
      bitmapOpts.resizeWidth = opts.resizeWidth;
      bitmapOpts.resizeQuality = opts.resizeQuality ?? "low";
    }
    return await createImageBitmap(file, bitmapOpts);
  } catch (err) {
    throw new PipelineError(
      "decode-failed",
      err instanceof Error ? err.message : undefined,
    );
  }
}
