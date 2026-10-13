/*
 * 5.14 오류 메시지 원칙 — 원인과 조치를 함께. 기술 용어를 노출하지 않는다.
 * 전체 L1/L2/L3 알림 체계와 조치 버튼 연결은 W4.
 */

import type { ErrorCode } from "@/core/types";

interface Msg {
  /** 목록 항목에 병기하는 짧은 사유 (L1) */
  short: string;
  /** 모달/배너용 제목 (W4) */
  title: string;
  body: string;
}

const TABLE: Record<ErrorCode, Msg> = {
  "unsupported-format": {
    short: "지원하지 않는 형식",
    title: "이 형식은 아직 지원하지 않습니다",
    body: "다른 형식의 파일로 시도해 주세요.",
  },
  "decode-failed": {
    short: "파일을 읽을 수 없음",
    title: "파일을 읽을 수 없습니다",
    body: "파일이 손상되었을 수 있습니다. 다른 파일로 시도해 주세요.",
  },
  "encode-failed": {
    short: "변환에 실패했습니다",
    title: "변환에 실패했습니다",
    body: "다른 출력 형식을 선택해 다시 시도해 주세요.",
  },
  "heic-module-failed": {
    short: "HEIC 준비 실패",
    title: "HEIC 변환을 준비하지 못했습니다",
    body: "페이지를 새로고침한 뒤 다시 시도해 주세요.",
  },
  "target-size-unreachable": {
    short: "목표 용량을 맞추지 못함",
    title: "품질만으로는 목표 용량을 맞출 수 없습니다",
    body: "크기를 함께 줄이면 가능합니다.",
  },
  "out-of-memory": {
    short: "이미지가 많거나 큼",
    title: "한 번에 처리하기에 이미지가 많거나 큽니다",
    body: "파일을 나눠서 처리해 주세요.",
  },
  "vector-module-failed": {
    short: "벡터 변환 준비 실패",
    title: "벡터 변환을 준비하지 못했습니다",
    body: "페이지를 새로고침한 뒤 다시 시도해 주세요.",
  },
  "vectorize-failed": {
    short: "벡터로 바꾸지 못함",
    title: "벡터로 바꾸지 못했습니다",
    body: "이미지가 너무 크거나 복잡할 수 있습니다. 크기를 줄여 다시 시도해 주세요.",
  },
  "upscale-module-failed": {
    short: "업스케일 준비 실패",
    title: "업스케일을 준비하지 못했습니다",
    body: "확대 엔진(약 26MB)을 내려받지 못했습니다. 연결을 확인하고 페이지를 새로고침한 뒤 다시 시도해 주세요.",
  },
  "upscale-failed": {
    short: "확대하지 못함",
    title: "이미지를 확대하지 못했습니다",
    body: "이미지가 너무 크거나 메모리가 부족할 수 있습니다. 더 작은 이미지로 다시 시도해 주세요.",
  },
  "image-too-large": {
    short: "이미지가 너무 큼",
    title: "업스케일하기에 이미지가 큽니다",
    body: "지금은 약 130만 픽셀(예: 1280×1080)까지 확대할 수 있습니다. 먼저 크기를 줄여 주세요.",
  },
  aborted: {
    short: "취소됨",
    title: "변환이 취소되었습니다",
    body: "",
  },
  unknown: {
    short: "변환에 실패했습니다",
    title: "변환하지 못했습니다",
    body: "다시 시도해 주세요.",
  },
};

export function errorMessage(code: ErrorCode | undefined): Msg {
  return TABLE[code ?? "unknown"];
}
