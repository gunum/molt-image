/*
 * 5.8 / 7.3 목표 용량 이진 탐색.
 *
 *   lo = 20, hi = 100, best = null
 *   반복 8회:
 *     mid = round((lo + hi) / 2)
 *     blob = encode(mid)
 *     if blob.size <= target:  best = blob; lo = mid + 1
 *     else:                    hi = mid - 1
 *
 * - 탐색은 축소된 캔버스가 아니라 실제 출력 크기에서 수행한다 (7.3).
 * - 매 회차가 실제 인코딩이지만 낮은 품질값에서 인코딩이 빨라 비용은 회차에 비례하지 않는다.
 *   M0 실측: 7회 328 ms — 단발 인코딩(74 ms)의 4.4배.
 * - 반복 횟수 8회로 확정 (M0 검증 완료).
 * - 8회 내에 목표 이하를 못 찾으면 reached=false로 반환하고, L3 모달은 UI가 띄운다
 *   (5.14 — "크기 함께 줄이기 / 이대로 진행").
 */

export const TARGET_SIZE_MAX_ITERATIONS = 8;
const Q_LO = 20;
const Q_HI = 100;

export interface TargetSearchResult {
  blob: Blob;
  quality: number;
  reached: boolean;
}

export async function searchQualityForTargetSize(
  encodeAt: (quality: number) => Promise<Blob>,
  targetBytes: number,
  onProgress?: (ratio: number) => void,
): Promise<TargetSearchResult> {
  let lo = Q_LO;
  let hi = Q_HI;
  let best: { blob: Blob; quality: number } | null = null;
  let smallest: { blob: Blob; quality: number } | null = null;

  for (let i = 0; i < TARGET_SIZE_MAX_ITERATIONS && lo <= hi; i++) {
    const mid = Math.round((lo + hi) / 2);
    const blob = await encodeAt(mid);
    onProgress?.((i + 1) / TARGET_SIZE_MAX_ITERATIONS);

    if (!smallest || blob.size < smallest.blob.size) {
      smallest = { blob, quality: mid };
    }
    if (blob.size <= targetBytes) {
      best = { blob, quality: mid };
      lo = mid + 1; // 더 높은 품질을 노려본다
    } else {
      hi = mid - 1;
    }
  }

  if (best) return { ...best, reached: true };
  // 목표 미달 — 지금까지 만든 것 중 가장 작은 결과를 돌려준다 (5.14 "이대로 진행" 대비)
  return { ...smallest!, reached: false };
}
