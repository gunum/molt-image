/*
 * 배경 제거 — 테두리에서 연결된 배경색만 지운다 (벡터화 전처리).
 *
 * 흰(또는 단색) 배경 위의 로고를 투명 배경 SVG로 만든다. VTracer는 알파 0 픽셀을
 * 형태에서 제외하므로, 배경을 투명하게 바꾸면 결과 SVG에 배경 패스가 생기지 않는다.
 *
 * 원리: 테두리 픽셀의 최빈색을 배경색으로 보고, 거기서 flood-fill 로 "테두리와
 *       연결된" 배경만 지운다 — 그림 안쪽에 우연히 같은 색이 있어도 건드리지 않는다.
 *
 * 참고 구현: kwak_svg_converter.html 의 dominantBorderColor / removeConnectedBackground
 *           (다른 개발자 작성). 로직만 옮기고 우리 코드 스타일로 정리.
 */

type RGB = [number, number, number];

/** 테두리(가장자리 1px) 픽셀의 최빈색 (4비트/채널 버킷). 비면 흰색 */
function dominantBorderColor(data: Uint8ClampedArray, w: number, h: number): RGB {
  const bins = new Map<number, [number, number, number, number]>();
  const add = (i: number) => {
    const p = i * 4;
    if (data[p + 3] < 16) return;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let z = bins.get(key);
    if (!z) bins.set(key, (z = [0, 0, 0, 0]));
    z[0] += r;
    z[1] += g;
    z[2] += b;
    z[3]++;
  };

  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    add(y * w);
    add(y * w + w - 1);
  }

  let best: [number, number, number, number] | null = null;
  for (const z of bins.values()) if (!best || z[3] > best[3]) best = z;
  return best
    ? [best[0] / best[3], best[1] / best[3], best[2] / best[3]]
    : [255, 255, 255];
}

/**
 * 배경으로 판정된 픽셀의 알파를 0으로 만든다 (img.data 를 제자리 수정).
 * @param tolerance 배경색과의 RGB 유클리드 거리 허용치 (0~255 권장 24~60)
 * @returns 지운 픽셀 수
 */
export function removeConnectedBackground(
  img: ImageData,
  tolerance: number,
): number {
  const { width: w, height: h, data: d } = img;
  const bg = dominantBorderColor(d, w, h);
  const mask = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const matches = (i: number) => {
    const p = i * 4;
    return (
      d[p + 3] > 8 &&
      Math.hypot(d[p] - bg[0], d[p + 1] - bg[1], d[p + 2] - bg[2]) <= tolerance
    );
  };
  const push = (i: number) => {
    if (mask[i] || !matches(i)) return;
    mask[i] = 1;
    queue[tail++] = i;
  };

  // 테두리 전체를 시드로
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    push(y * w);
    push(y * w + w - 1);
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i / w) | 0;
    if (x) push(i - 1);
    if (x + 1 < w) push(i + 1);
    if (y) push(i - w);
    if (y + 1 < h) push(i + w);
  }

  let removed = 0;
  for (let i = 0; i < w * h; i++) {
    if (mask[i]) {
      d[i * 4 + 3] = 0;
      removed++;
    }
  }
  return removed;
}
