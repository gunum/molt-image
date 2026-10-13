/*
 * Phase 3 — AI 업스케일 (ONNX Runtime Web + Real-ESRGAN).
 *
 * 일정 8.6 M4:
 *   W1~2  모델 선정 · ONNX Runtime Web 연동 · 단일 이미지 추론      (완료)
 *   W3    타일 분할 처리 · 메모리 상한 · 타일 단위 진행률           (완료)
 *   W4    알파 채널 확대                                            (이 파일)
 *   W5    WebGPU / WASM 폴백 분기
 *
 * 모델: realesr-general-x4v3 (SRVGGNetCompact, 약 4.8MB, BSD-3, xinntao/Real-ESRGAN).
 *   입력  "input"  [1,3,H,W] float32, RGB, 0~1, NCHW
 *   출력  "output" [1,3,H*4,W*4] float32, RGB, 0~1
 *   배율은 x4 고정. scale=2 는 조립 시 목표 배율로 축소해 만든다.
 *
 * 7.6 지연 로딩 구조를 libheif·VTracer 에서 검증한 뒤 그대로 재사용한다 (7.10):
 *   - onnxruntime-web(런타임 wasm 약 21MB) + 모델은 초기 번들에 넣지 않는다
 *   - 업스케일이 처음 필요할 때 동적 import + fetch
 *   - 워커마다 별도 세션 (WASM/WebGPU 컨텍스트는 워커 간 공유 불가)
 *
 * 타일 분할 (W3):
 *   - 입력을 TILE 크기로 나누고, 경계 이음새를 없애려 PAD 픽셀씩 겹쳐 추론한다
 *   - 각 타일을 x4 추론 → 겹친 가장자리를 잘라내고 목표 배율 캔버스에 조립
 *   - 메모리는 "타일 하나의 x4 결과 + 목표 배율 조립 캔버스"로 묶인다.
 *     전체 x4 캔버스를 만들지 않으므로 scale=2 는 입력의 4배 픽셀만 상주한다
 *   - 진행률은 완료 타일 수 / 전체 타일 수
 *
 * 알파 채널 (W4):
 *   - 모델은 RGB 만 받는다. 투명도가 있는 입력(로고·스티커·누끼 컷아웃)은
 *     알파를 따로 처리한다 — 초해상이 필요 없고, 이중선형 확대로 충분하다
 *     (Real-ESRGAN 원 구현도 알파는 리사이즈만 한다)
 *   - RGB 는 타일 추론, 알파는 회색조 이중선형 확대(프리멀티플라이 왜곡 없음) 후 재결합
 *   - 완전 불투명 입력은 이 경로를 건너뛴다 (스캔 1회로 판별)
 *   - 반투명 경계에서 모델이 투명 영역의 RGB(대개 검정)를 끌어와 생기는 옅은
 *     테두리는 남는 한계 — 알파 블리딩은 후속(W7~8 튜닝)
 *
 * WebGPU: ORT 1.22 의 WebGPU EP 는 이 모델의 Clip 커널에서 실패한다(실측).
 * WASM(멀티스레드)만 쓴다. WebGPU 경로는 W5.
 */

import {
  PipelineError,
  UPSCALE_MAX_INPUT_PX,
  UPSCALE_MAX_OUTPUT_PX,
  type UpscaleSettings,
} from "./types";

/** 모델 고정 배율 */
export const MODEL_SCALE = 4;

/** 타일 한 변(입력 픽셀). 이보다 작은 이미지는 한 번에 추론한다 */
const TILE = 224;
/** 타일 겹침(입력 픽셀). 경계 이음새 제거용 — 잘라내는 여백 */
const PAD = 16;

const MODEL_URL = "/models/realesr-general-x4v3.onnx";
/** onnxruntime-web 런타임(.wasm/.mjs) 자체 호스팅 경로 (7.7). scripts/setup-upscale.mjs 가 채운다 */
const ORT_ASSET_PATH = "/ort/";
const RETRY_LIMIT = 3;

type OrtNamespace = typeof import("onnxruntime-web");
type Session = import("onnxruntime-web").InferenceSession;

export type UpscaleBackend = "webgpu" | "wasm";

interface Loaded {
  ort: OrtNamespace;
  session: Session;
  backend: UpscaleBackend;
}

let loadPromise: Promise<Loaded> | null = null;

async function create(): Promise<Loaded> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
    try {
      // webgpu 진입점 = WebGPU + WASM(JSEP) 양쪽 포함. 지금은 wasm EP 만 쓴다 (W5).
      const ort = (await import(
        "onnxruntime-web/webgpu"
      )) as unknown as OrtNamespace;

      ort.env.wasm.wasmPaths = ORT_ASSET_PATH;
      // COOP/COEP 가 켜져 있어(7.7) SharedArrayBuffer 사용 가능 → 멀티스레드 WASM
      const hc = globalThis.navigator?.hardwareConcurrency ?? 4;
      ort.env.wasm.numThreads = Math.max(1, Math.min(hc - 1, 4));

      const session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });

      return { ort, session, backend: "wasm" };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new PipelineError(
    "upscale-module-failed",
    lastErr instanceof Error ? lastErr.message : undefined,
  );
}

export function loadUpscaler(): Promise<Loaded> {
  if (!loadPromise) {
    loadPromise = create().catch((err) => {
      loadPromise = null; // 실패는 캐시하지 않는다
      throw err;
    });
  }
  return loadPromise;
}

/** `/upscale-image` 등 업스케일 랜딩 진입 시 미리 호출한다 (7.6). 실패는 조용히 무시 */
export function preloadUpscaler(): void {
  void loadUpscaler().catch(() => {});
}

/** RGBA8 타일 하나를 x4 추론한다 (타일 분할의 기본 단위). */
async function runModelX4(
  session: Session,
  ort: OrtNamespace,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<{ data: Float32Array; width: number; height: number }> {
  // RGBA8 → NCHW float32 (채널 분리, 0~1 정규화)
  const px = width * height;
  const chw = new Float32Array(px * 3);
  for (let i = 0; i < px; i++) {
    chw[i] = rgba[i * 4] / 255;
    chw[px + i] = rgba[i * 4 + 1] / 255;
    chw[px * 2 + i] = rgba[i * 4 + 2] / 255;
  }

  let outTensor;
  try {
    const input = new ort.Tensor("float32", chw, [1, 3, height, width]);
    const result = await session.run({ [session.inputNames[0]]: input });
    outTensor = result[session.outputNames[0]];
  } catch (err) {
    throw new PipelineError(
      "upscale-failed",
      err instanceof Error ? err.message : undefined,
    );
  }

  const [, , outH, outW] = outTensor.dims as number[];
  return { data: outTensor.data as Float32Array, width: outW, height: outH };
}

/** 모델 출력(planar float32 RGB) → RGBA8 ImageData */
function planarToImageData(
  planar: Float32Array,
  width: number,
  height: number,
): ImageData {
  const px = width * height;
  const out = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    out[i * 4] = planar[i] * 255;
    out[i * 4 + 1] = planar[px + i] * 255;
    out[i * 4 + 2] = planar[px * 2 + i] * 255;
    out[i * 4 + 3] = 255;
  }
  return new ImageData(out, width, height);
}

function make2d(w: number, h: number): {
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
} {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new PipelineError("upscale-failed", "2d 컨텍스트 없음");
  return { canvas, ctx };
}

/** 알파가 하나라도 255 미만이면 false */
function isFullyOpaque(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return false;
  }
  return true;
}

/**
 * 알파 채널만 목표 크기로 이중선형 확대한다. 회색조(불투명)로 옮겨 리사이즈하므로
 * 캔버스의 프리멀티플라이 왜곡이 없다. 반환: 길이 outW*outH 의 알파값 배열.
 */
function upscaleAlpha(
  src: ImageData,
  outW: number,
  outH: number,
): Uint8ClampedArray {
  const W = src.width;
  const H = src.height;
  const gray = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const a = src.data[i * 4 + 3];
    gray[i * 4] = a;
    gray[i * 4 + 1] = a;
    gray[i * 4 + 2] = a;
    gray[i * 4 + 3] = 255;
  }
  const from = make2d(W, H);
  from.ctx.putImageData(new ImageData(gray, W, H), 0, 0);

  const to = make2d(outW, outH);
  to.ctx.imageSmoothingEnabled = true;
  to.ctx.imageSmoothingQuality = "high";
  to.ctx.drawImage(from.canvas, 0, 0, W, H, 0, 0, outW, outH);

  const scaled = to.ctx.getImageData(0, 0, outW, outH).data;
  const alpha = new Uint8ClampedArray(outW * outH);
  for (let i = 0; i < alpha.length; i++) alpha[i] = scaled[i * 4];
  return alpha;
}

/**
 * 투명·반투명 영역의 RGB 를 인접 불투명 색으로 채운 **불투명** 이미지를 만든다.
 *
 * 모델은 알파를 못 보므로, 투명 영역의 RGB(대개 검정이거나 언프리멀티플라이
 * 반올림 잡음)를 그대로 추론하면 경계에 검은 테두리가 생긴다. 불투명 내부 색을
 * 경계 밖으로 몇 픽셀 번지게 하고 알파를 전부 255 로 만들어(캔버스 프리멀티플라이
 * 왕복에서 번진 색이 지워지지 않도록) 모델에 넣는다.
 * 최종 알파는 원본에서 따로 뽑으므로(upscaleAlpha) 번진 색은 결과에 안 보인다.
 */
function bleedToOpaqueRGB(src: ImageData, iterations = 8): ImageData {
  const W = src.width;
  const H = src.height;
  const data = new Uint8ClampedArray(src.data); // 복사
  // 색이 신뢰할 만한 픽셀을 씨앗으로. 캔버스 getImageData 는 언프리멀티플라이라
  // 알파가 아주 낮을(<24) 때만 RGB 정밀도가 무너진다 — 반투명 채움 색은 살린다.
  const KNOWN_ALPHA = 24;
  const known = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++)
    known[i] = src.data[i * 4 + 3] >= KNOWN_ALPHA ? 1 : 0;

  for (let it = 0; it < iterations; it++) {
    const prev = known.slice();
    let filled = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (prev[p]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const q = ny * W + nx;
            if (!prev[q]) continue;
            r += data[q * 4];
            g += data[q * 4 + 1];
            b += data[q * 4 + 2];
            n++;
          }
        }
        if (n) {
          data[p * 4] = r / n;
          data[p * 4 + 1] = g / n;
          data[p * 4 + 2] = b / n;
          known[p] = 1;
          filled++;
        }
      }
    }
    if (!filled) break; // 더 번질 곳 없음
  }

  // 남은 완전 투명 영역(번짐이 닿지 않은 곳)은 중립 회색으로
  for (let i = 0; i < W * H; i++) {
    if (!known[i]) {
      data[i * 4] = 128;
      data[i * 4 + 1] = 128;
      data[i * 4 + 2] = 128;
    }
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, W, H);
}

export interface UpscaleOutput {
  /** RGBA8, 길이 width*height*4 — 목표 배율 결과 */
  data: Uint8ClampedArray;
  width: number;
  height: number;
  backend: UpscaleBackend;
  /** 조립에 쓴 타일 수 (1 = 단일 추론) */
  tiles: number;
  /** 입력에 투명 픽셀이 있어 알파를 따로 확대했는지 */
  hadAlpha: boolean;
}

/**
 * ImageData 를 목표 배율로 확대한다. RGB 는 타일 추론, 알파는 따로 이중선형 확대해
 * 재결합한다. 완전 불투명 입력은 알파 처리를 건너뛴다.
 *
 * @param onProgress 추론 단계 진행률 0~1 (완료 타일 비율)
 */
export async function upscaleImage(
  src: ImageData,
  settings: UpscaleSettings,
  onProgress?: (ratio: number) => void,
): Promise<UpscaleOutput> {
  const W = src.width;
  const H = src.height;
  const targetScale = settings.scale;

  if (W * H > UPSCALE_MAX_INPUT_PX) {
    throw new PipelineError(
      "image-too-large",
      `업스케일 입력이 너무 큽니다 (${W}×${H}).`,
    );
  }
  if (W * targetScale * H * targetScale > UPSCALE_MAX_OUTPUT_PX) {
    throw new PipelineError(
      "image-too-large",
      `확대 결과가 너무 큽니다 (${W * targetScale}×${H * targetScale}). 먼저 크기를 줄여 주세요.`,
    );
  }

  const { ort, session, backend } = await loadUpscaler();

  const hadAlpha = !isFullyOpaque(src.data);
  const outW = W * targetScale;
  const outH = H * targetScale;
  // 목표 배율 조립 캔버스 (x4 전체 캔버스는 만들지 않는다)
  const asm = make2d(outW, outH);
  // 타일 추출용 캔버스. 투명도가 있으면 경계 검은 테두리를 막으려 RGB 를 번지게 하고
  // 불투명하게 만들어 넣는다 (최종 알파는 원본에서 따로 뽑는다)
  const source = make2d(W, H);
  source.ctx.putImageData(hadAlpha ? bleedToOpaqueRGB(src) : src, 0, 0);

  const single = W <= TILE && H <= TILE;
  const cols = single ? 1 : Math.ceil(W / TILE);
  const rows = single ? 1 : Math.ceil(H / TILE);
  const total = cols * rows;

  // 조립 시 목표 배율로 축소하는 비율 (x4 결과 → 목표)
  const shrink = targetScale / MODEL_SCALE; // scale=4 → 1, scale=2 → 0.5

  onProgress?.(0);
  let done = 0;

  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const x0 = rx * TILE;
      const y0 = ry * TILE;
      const tw = Math.min(TILE, W - x0);
      const th = Math.min(TILE, H - y0);

      // 겹침 포함 추출 영역 (가장자리에서는 이미지 안쪽으로만)
      const sx = Math.max(0, x0 - PAD);
      const sy = Math.max(0, y0 - PAD);
      const sw = Math.min(W, x0 + tw + PAD) - sx;
      const sh = Math.min(H, y0 + th + PAD) - sy;

      const tileIn = source.ctx.getImageData(sx, sy, sw, sh);
      const modelOut = await runModelX4(session, ort, tileIn.data, sw, sh);
      const tileImg = planarToImageData(
        modelOut.data,
        modelOut.width,
        modelOut.height,
      );

      // x4 타일에서 유효(겹침 제외) 영역
      const vx = (x0 - sx) * MODEL_SCALE;
      const vy = (y0 - sy) * MODEL_SCALE;
      const vw = tw * MODEL_SCALE;
      const vh = th * MODEL_SCALE;

      // 유효 영역만 목표 배율로 축소하며 조립 캔버스에 배치
      const tileCanvas = make2d(modelOut.width, modelOut.height);
      tileCanvas.ctx.putImageData(tileImg, 0, 0);
      asm.ctx.imageSmoothingEnabled = true;
      asm.ctx.imageSmoothingQuality = "high";
      asm.ctx.drawImage(
        tileCanvas.canvas,
        vx,
        vy,
        vw,
        vh,
        Math.round(x0 * targetScale),
        Math.round(y0 * targetScale),
        Math.round(vw * shrink),
        Math.round(vh * shrink),
      );

      done++;
      onProgress?.(done / total);
    }
  }

  // scale=2 에서 타일별 0.5배 축소는 drawImage 한 단계다. x4 SR 결과에서 x2 로
  // 줄이는 정도라 계단 현상이 없어 단계적 축소(resize.ts)는 쓰지 않는다.
  const outData = asm.ctx.getImageData(0, 0, outW, outH).data;

  // 알파 재결합 — RGB(불투명 조립) 위에 따로 확대한 알파를 덮는다
  if (hadAlpha) {
    const alpha = upscaleAlpha(src, outW, outH);
    for (let i = 0; i < alpha.length; i++) outData[i * 4 + 3] = alpha[i];
  }

  return {
    data: outData,
    width: outW,
    height: outH,
    backend,
    tiles: total,
    hadAlpha,
  };
}
