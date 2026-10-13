/*
 * 5.3.2 L2 배너 — 변환 실행 "전"에 알아야 하는 내용. items·settings에서 파생한다.
 * 사용자는 읽고 설정을 바꿀 수 있고, 무시하고 진행할 수도 있다.
 *
 *   - 투명도 손실 경고 (PNG/WebP → JPEG)
 *   - 원본보다 큰 크기 지정 시 화질 저하 안내
 *   - 100장 초과 / 단일 50MB 초과
 *   - 세로·가로 혼재 시 "긴 변 기준" 권장
 */

import {
  isOpaqueFormat,
  resolveKeepFormat,
  type ConvertSettings,
} from "@/core/types";
import type { FileItem } from "@/store/useFileStore";

export interface Banner {
  key: string;
  message: string;
  /** 조치 버튼 (5.3.2 / 5.14) */
  action?: { label: string; patch: Partial<ConvertSettings> };
}

const LIMIT_FILES = 100;
const LIMIT_BYTES = 50 * 1024 * 1024;

export function computeBanners(
  items: FileItem[],
  settings: ConvertSettings,
  keepFormat: boolean,
): Banner[] {
  const live = items.filter((it) => it.status !== "excluded");
  if (live.length === 0) return [];

  // 벡터화: 품질·투명도·용량 경고 대신 적합성 경고만 (8.5)
  if (settings.mode === "vector") {
    const poor = live.filter((it) => it.vectorSuitability === "poor").length;
    if (poor === 0) return [];
    return [
      {
        key: "vector-unsuitable",
        message:
          poor === live.length
            ? "사진에 가까운 이미지입니다. 벡터 변환 결과가 크고 부정확할 수 있습니다."
            : `${poor}장이 사진에 가까워 벡터 변환 결과가 좋지 않을 수 있습니다.`,
      },
    ];
  }

  const banners: Banner[] = [];

  const outFor = (it: FileItem) =>
    keepFormat ? resolveKeepFormat(it.source) : settings.output;

  // 투명도 손실 (5.6)
  const losesAlpha = live.some((it) => it.hasAlpha && isOpaqueFormat(outFor(it)));
  if (losesAlpha) {
    banners.push({
      key: "transparency-loss",
      message: "투명한 부분이 흰색으로 채워집니다.",
    });
  }

  // 원본보다 큰 크기 지정 (5.7)
  if (settings.resize.kind !== "keep") {
    const upscales = live.some((it) => {
      if (!it.sourceWidth || !it.sourceHeight) return false;
      const long = Math.max(it.sourceWidth, it.sourceHeight);
      if (settings.resize.kind === "longEdge") return settings.resize.px > long;
      if (settings.resize.kind === "width")
        return settings.resize.px > it.sourceWidth;
      if (settings.resize.kind === "scale") return settings.resize.ratio > 1;
      return false;
    });
    if (upscales) {
      banners.push({
        key: "upscale",
        message:
          "원본보다 커지면 화질이 떨어집니다. 확대는 업스케일 기능을 이용하세요.",
        action: { label: "원본 유지로 되돌리기", patch: { resize: { kind: "keep" } } },
      });
    }
  }

  // 세로·가로 혼재 (5.7)
  if (settings.resize.kind === "width" || settings.resize.kind === "scale") {
    let hasLandscape = false;
    let hasPortrait = false;
    for (const it of live) {
      if (!it.sourceWidth || !it.sourceHeight) continue;
      if (it.sourceWidth > it.sourceHeight) hasLandscape = true;
      else if (it.sourceHeight > it.sourceWidth) hasPortrait = true;
    }
    if (hasLandscape && hasPortrait) {
      banners.push({
        key: "orientation-mix",
        message:
          "세로·가로 사진이 섞여 있습니다. 긴 변 기준이 가장 안전합니다.",
        action: {
          label: "긴 변 기준으로 바꾸기",
          patch: { resize: { kind: "longEdge", px: 1920 } },
        },
      });
    }
  }

  // 100장 초과 (5.4 / 7.5)
  if (live.length > LIMIT_FILES) {
    banners.push({
      key: "many-files",
      message: `${live.length}장은 시간이 오래 걸리고 메모리가 부족할 수 있습니다.`,
    });
  }

  // 단일 50MB 초과 (5.4 / 7.5)
  if (live.some((it) => it.originalSize > LIMIT_BYTES)) {
    banners.push({
      key: "large-file",
      message: "50MB가 넘는 파일이 있어 변환이 느리거나 실패할 수 있습니다.",
    });
  }

  return banners;
}
