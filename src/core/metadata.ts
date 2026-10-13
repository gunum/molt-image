/*
 * 5.6 / 7.3 메타데이터 — EXIF 파싱·회전·제거.
 *
 * 기본 동작 (5.6):
 *   EXIF 회전 정보  → 픽셀에 반영 후 제거   ← stripMetadata 값과 무관하게 항상
 *   GPS 위치 정보   → 제거 (기본)
 *   카메라 정보·촬영 일시 → 제거 (기본)
 *   색 프로파일(ICC) → 유지
 *
 * 회전은 디코딩 단계에서 픽셀에 반영된다:
 *   - 비 HEIC: createImageBitmap(file, { imageOrientation: "from-image" })  (decode.ts)
 *   - HEIC:   libheif가 irot/imir 반영
 * 따라서 인코딩 결과(Canvas)에는 회전 메타데이터가 없다 = 자동 제거.
 *
 * stripMetadata=false(체크 해제)면 원본 메타데이터를 유지한다. Canvas 인코딩은
 * 모든 메타데이터를 버리므로, JPEG→JPEG 경로에서 원본 APP1(EXIF)을 출력에 다시
 * 삽입한다. 이때 Orientation 태그는 1로 정규화한다 — 픽셀이 이미 회전됐으므로
 * 원본값(예: 6)을 그대로 두면 뷰어가 이중 회전한다.
 *
 * TODO(W2 범위 밖): PNG/WebP 소스의 메타데이터 유지, ICC 프로파일 명시적 이식.
 *   현재는 JPEG 소스 + JPEG 출력에서만 유지가 동작하고, 그 외 조합은 제거된다.
 */

const SOI = 0xffd8;
const APP1 = 0xffe1;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
const TAG_ORIENTATION = 0x0112;

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** JPEG 바이트에서 APP1(EXIF) 세그먼트 전체를 잘라낸다 (마커+길이 포함). 없으면 null */
export function extractExifSegment(jpeg: Uint8Array): Uint8Array | null {
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  if (view.getUint16(0) !== SOI) return null;

  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffda) break; // SOS — 이후는 압축 데이터
    const size = view.getUint16(offset + 2); // 길이(자기 2바이트 포함)
    if (marker === APP1 && hasExifHeader(jpeg, offset + 4)) {
      return jpeg.slice(offset, offset + 2 + size);
    }
    offset += 2 + size;
  }
  return null;
}

function hasExifHeader(bytes: Uint8Array, at: number): boolean {
  return EXIF_HEADER.every((b, i) => bytes[at + i] === b);
}

/** EXIF 세그먼트(APP1) 또는 원본 JPEG에서 Orientation 값을 읽는다. 기본 1 */
export function readOrientation(jpeg: Uint8Array): ExifOrientation {
  const seg = looksLikeApp1(jpeg) ? jpeg : extractExifSegment(jpeg);
  if (!seg) return 1;
  const tiffStart = 4 + EXIF_HEADER.length; // 마커(2) + 길이(2) + "Exif\0\0"
  const found = walkIfd0(seg, tiffStart, (view, little, valueOffset, type) => {
    if (type !== 3) return null; // SHORT
    return view.getUint16(valueOffset, little);
  });
  return isOrientation(found) ? found : 1;
}

function looksLikeApp1(bytes: Uint8Array): boolean {
  return bytes.length > 4 && (bytes[0] << 8) + bytes[1] === APP1;
}

/**
 * stripMetadata=false: 원본 APP1을 Canvas 출력 JPEG에 다시 삽입한다.
 * Orientation은 1로 정규화한다. 출력이 JPEG가 아니거나 원본에 EXIF가 없으면
 * 원본 blob을 그대로 돌려준다.
 */
export async function reattachExif(
  encoded: Blob,
  sourceExifSegment: Uint8Array | null,
): Promise<Blob> {
  if (!sourceExifSegment || encoded.type !== "image/jpeg") return encoded;

  const seg = sourceExifSegment.slice();
  normalizeOrientation(seg);

  const out = new Uint8Array(await encoded.arrayBuffer());
  const view = new DataView(out.buffer);
  if (view.getUint16(0) !== SOI) return encoded;

  // SOI 직후에 APP1을 삽입한다 (기존 APP0/JFIF보다 앞이어도 유효)
  const merged = new Uint8Array(2 + seg.length + (out.length - 2));
  merged.set(out.subarray(0, 2), 0);
  merged.set(seg, 2);
  merged.set(out.subarray(2), 2 + seg.length);
  return new Blob([merged], { type: "image/jpeg" });
}

/** APP1 세그먼트 안의 Orientation 태그 값을 1로 덮어쓴다 (제자리 수정) */
function normalizeOrientation(seg: Uint8Array): void {
  const tiffStart = 4 + EXIF_HEADER.length;
  walkIfd0(seg, tiffStart, (view, little, valueOffset, type) => {
    if (type === 3) view.setUint16(valueOffset, 1, little);
    return null;
  });
}

/**
 * IFD0 항목을 순회하며 Orientation 태그를 찾는다.
 * visit이 null이 아닌 값을 반환하면 그 값으로 즉시 종료한다.
 */
function walkIfd0(
  seg: Uint8Array,
  tiffStart: number,
  visit: (
    view: DataView,
    little: boolean,
    valueOffset: number,
    type: number,
  ) => number | null,
): number | null {
  if (tiffStart + 8 > seg.length) return null;
  const view = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);

  const bom = view.getUint16(tiffStart);
  const little = bom === 0x4949;
  if (!little && bom !== 0x4d4d) return null;
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;

  const ifd0 = tiffStart + view.getUint32(tiffStart + 4, little);
  if (ifd0 + 2 > seg.length) return null;

  const count = view.getUint16(ifd0, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > seg.length) break;
    if (view.getUint16(entry, little) !== TAG_ORIENTATION) continue;
    const type = view.getUint16(entry + 2, little);
    const result = visit(view, little, entry + 8, type);
    if (result !== null) return result;
    return null; // 태그를 찾았으면 순회 종료
  }
  return null;
}

function isOrientation(v: number | null): v is ExifOrientation {
  return v !== null && v >= 1 && v <= 8;
}
