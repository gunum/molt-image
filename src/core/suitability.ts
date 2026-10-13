/*
 * Phase 2 — 벡터화 적합성 판정 (일정 8.5의 핵심 난이도).
 *
 * "사진을 넣으면 결과가 나쁜데, 이를 미리 걸러내지 못하면 사용자 실망이 이탈로
 *  직결된다. 색상 히스토그램과 엣지 밀도로 '사진인지 일러스트인지'를 추정한다."
 *
 * 순수 함수 — ImageData(브라우저/워커 공통 데이터 타입)만 받는다. DOM 미의존 (7.2).
 *
 * 세 지표:
 *   distinctColors : 4비트/채널로 양자화한 색 버킷 수. 로고 < 수십, 사진 > 수천
 *   flatRatio      : 오른쪽·아래 이웃과 거의 같은 픽셀 비율. 평평한 채움이 많을수록 ↑
 *   edgeRatio      : 밝기 기울기가 큰 픽셀 비율. 선명한 경계 비중
 */

export type Suitability = "good" | "fair" | "poor";

export interface SuitabilityReport {
  verdict: Suitability;
  distinctColors: number;
  flatRatio: number;
  edgeRatio: number;
}

const SAMPLE_MAX = 256; // 판정용으로 이 크기까지 축소해 계산한다
const FLAT_DELTA = 10; // 이웃 밝기 차가 이보다 작으면 "평평"
const EDGE_DELTA = 48; // 이보다 크면 "경계"

/** RGBA ImageData → 적합성 리포트 */
export function assessVectorSuitability(img: ImageData): SuitabilityReport {
  const { small, w, h } = downsample(img);
  const total = w * h;

  // ── 색 버킷 (4비트/채널) ──────────────────────────────────
  const buckets = new Set<number>();
  for (let i = 0; i < small.length; i += 4) {
    if (small[i + 3] < 8) continue; // 투명 픽셀 제외
    const key =
      ((small[i] >> 4) << 8) | ((small[i + 1] >> 4) << 4) | (small[i + 2] >> 4);
    buckets.add(key);
  }
  const distinctColors = buckets.size;

  // ── flat / edge 비율 ─────────────────────────────────────
  const luma = new Uint8ClampedArray(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    luma[p] = (small[i] * 77 + small[i + 1] * 150 + small[i + 2] * 29) >> 8;
  }

  let flat = 0;
  let edge = 0;
  let counted = 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const p = y * w + x;
      const dRight = Math.abs(luma[p] - luma[p + 1]);
      const dDown = Math.abs(luma[p] - luma[p + w]);
      const g = Math.max(dRight, dDown);
      if (g <= FLAT_DELTA) flat++;
      else if (g >= EDGE_DELTA) edge++;
      counted++;
    }
  }
  const flatRatio = counted ? flat / counted : 0;
  const edgeRatio = counted ? edge / counted : 0;

  return { verdict: verdictOf(distinctColors, flatRatio), distinctColors, flatRatio, edgeRatio };
}

function verdictOf(colors: number, flat: number): Suitability {
  // 사진: 색이 매우 많거나 평평한 영역이 거의 없다
  if (colors > 2500 || flat < 0.22) return "poor";
  // 로고·아이콘: 색이 적고 평평한 채움이 크다
  if (colors <= 64 && flat >= 0.5) return "good";
  return "fair";
}

function downsample(img: ImageData): {
  small: Uint8ClampedArray;
  w: number;
  h: number;
} {
  const scale = Math.min(1, SAMPLE_MAX / Math.max(img.width, img.height));
  if (scale === 1) {
    return { small: img.data, w: img.width, h: img.height };
  }
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const src = img.data;
  const out = new Uint8ClampedArray(w * h * 4);
  // 최근접 샘플링 — 판정 지표에는 충분하다
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / scale);
      const si = (sy * img.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return { small: out, w, h };
}

/** 사용자 메시지 (5.14 톤 — 원인 + 조치) */
export const SUITABILITY_TEXT: Record<Suitability, string> = {
  good: "벡터 변환에 적합한 이미지입니다.",
  fair: "벡터 변환은 가능하나 결과가 단순해질 수 있습니다.",
  poor: "사진에 가까워 벡터 변환 결과가 크고 부정확할 수 있습니다.",
};
