/* 타입: scripts/vendor-vtracer.mjs 가 아니라 여기서 손으로 관리한다 */
export function initVtracer(wasmUrl: string): Promise<void>;
export function vectorize_bytes(
  data: Uint8Array,
  options?: Record<string, unknown>,
): string;
export function vectorize_rgba(
  data: Uint8Array,
  width: number,
  height: number,
  options?: Record<string, unknown>,
): string;
