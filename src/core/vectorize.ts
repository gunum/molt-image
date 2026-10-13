/*
 * Phase 2 — 래스터 → SVG 벡터화 (VTracer).
 *
 * 8.5 M3: "핵심 난이도는 WASM 연동이 아니라 적합성 판정." 적합성 판정은 별도
 * (vectorSuitability). 이 파일은 WASM 로딩 + 호출만 담당한다.
 *
 * 7.6의 지연 로딩 구조를 libheif에서 검증한 뒤 그대로 재사용한다 (7.10):
 *   - vtracer.wasm(약 650KB)은 초기 번들에 넣지 않는다
 *   - 벡터화가 처음 필요할 때 동적 import + fetch
 *   - 워커마다 별도 인스턴스 (WASM 인스턴스는 워커 간 공유 불가)
 *   - TODO(W5): .wasm 파일명에 콘텐츠 해시 (7.7 캐시)
 */

import {
  DEFAULT_VECTOR,
  PipelineError,
  type VectorSettings,
} from "./types";

const WASM_URL = "/wasm/vtracer.wasm";
const RETRY_LIMIT = 3;

interface VtracerModule {
  initVtracer: (wasmUrl: string) => Promise<void>;
  vectorize_rgba: (
    data: Uint8Array,
    width: number,
    height: number,
    options: Record<string, unknown>,
  ) => string;
}

let modPromise: Promise<VtracerModule> | null = null;

async function importVtracer(): Promise<VtracerModule> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const mod = (await import(
        "@/vendor/vtracer/vtracer_wasm.mjs"
      )) as unknown as VtracerModule;
      await mod.initVtracer(WASM_URL);
      return mod;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new PipelineError(
    "vector-module-failed",
    lastErr instanceof Error ? lastErr.message : undefined,
  );
}

export function loadVtracer(): Promise<VtracerModule> {
  if (!modPromise) {
    modPromise = importVtracer().catch((err) => {
      modPromise = null; // 실패는 캐시하지 않는다
      throw err;
    });
  }
  return modPromise;
}

/** `/png-to-svg` 등 벡터화 랜딩 진입 시 미리 호출한다 (7.6). 실패는 조용히 무시 */
export function preloadVtracer(): void {
  void loadVtracer().catch(() => {});
}

/** VectorSettings → VTracer camelCase 옵션 */
function toOptions(v: VectorSettings): Record<string, unknown> {
  const o: Record<string, unknown> = {
    clustering: v.clustering === "bw" ? "bw" : "color-cluster",
    mode: v.curve,
    filterSpeckle: v.filterSpeckle,
    colorPrecision: v.colorPrecision,
    layerDifference: v.layerDifference,
    cornerThreshold: v.cornerThreshold,
    lengthThreshold: v.lengthThreshold,
    spliceThreshold: v.spliceThreshold,
    pathPrecision: v.pathPrecision,
  };
  if (v.palette.length > 0) {
    // 고정 팔레트가 있으면 자동 색 결정을 대체한다
    o.palette = v.palette;
  } else if (v.maxColors > 0) {
    o.maxColors = v.maxColors;
  }
  return o;
}

/**
 * RGBA8 픽셀 버퍼(width*height*4)를 SVG 문자열로 벡터화한다.
 * 자르기·리사이즈는 파이프라인 상위 단계에서 이미 끝난 상태로 들어온다 (7.3 순서).
 */
export async function vectorize(
  rgba: Uint8Array,
  width: number,
  height: number,
  settings: VectorSettings = DEFAULT_VECTOR,
): Promise<string> {
  const mod = await loadVtracer();
  try {
    return mod.vectorize_rgba(rgba, width, height, toOptions(settings));
  } catch (err) {
    throw new PipelineError(
      "vectorize-failed",
      err instanceof Error ? err.message : undefined,
    );
  }
}
