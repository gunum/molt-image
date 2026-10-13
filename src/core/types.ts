/*
 * core/ 공통 타입.
 * core/는 브라우저 API(Canvas, OffscreenCanvas) 외 어떤 것에도 의존하지 않는다.
 * React·Next·DOM을 참조하지 않는다 (7.2). Phase 4 모바일 이식 대상.
 */

/** 매직 넘버로 판별한 입력 포맷 (7.3 포맷 판별) */
export type SourceFormat =
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "bmp"
  | "heic"
  | "avif"
  | "unknown";

/** 출력 포맷 (5.6). HEIC는 인코딩 대상이 아니다 */
export type OutputFormat = "jpeg" | "png" | "webp" | "bmp";

/** 크기 변경 방식 (5.7). 비율은 항상 유지한다 */
export type ResizeMode =
  | { kind: "keep" }
  | { kind: "longEdge"; px: number } // 긴 변을 지정값으로
  | { kind: "width"; px: number } // 너비 고정, 높이는 비율
  | { kind: "scale"; ratio: number }; // 원본 대비 배율 (0~n)

/** 품질/용량 모드 (5.8) */
export type QualityMode =
  | { kind: "quality"; value: number } // 1~100, 기본 85
  | { kind: "targetSize"; bytes: number }; // 목표 이하가 되는 최대 품질을 이진 탐색

/** 자르기 영역 — 원본(회전 보정 후) 해상도 기준 (5.9) */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 변환 방식 (7.10 Phase 2·3 연결 지점 — "워커 메시지 규약에 mode 필드 추가 여지").
 *   raster  : 래스터 → 래스터 (Phase 1)
 *   vector  : 래스터 → SVG 벡터 (Phase 2, VTracer)
 *   upscale : AI 초해상 확대 (Phase 3, ONNX Runtime Web + Real-ESRGAN)
 */
export type ConvertMode = "raster" | "vector" | "upscale";

/** VTracer 벡터화 파라미터 (Phase 2). camelCase 그대로 wasm에 전달된다 */
export interface VectorSettings {
  /** color-cluster(색상 계층 군집) 또는 bw(이진) */
  clustering: "color" | "bw";
  /** 곡선 표현: spline(곡선) / polygon(직선) / pixel(픽셀) */
  curve: "spline" | "polygon" | "pixel";
  /** 잡티 제거 — 이 픽셀 수 미만의 영역은 버린다 (0~20, 기본 4) */
  filterSpeckle: number;
  /** 색상 정밀도 비트 수 (1~8, 기본 6). 낮을수록 색 수가 줄고 파일이 작아진다 */
  colorPrecision: number;
  /** 인접 색 레이어를 합치는 임계값 (0~128, 기본 16). 높을수록 레이어·파일이 준다 */
  layerDifference: number;
  /** 최종 색 수 상한. 0 = 제한 없음 (VTracer maxColors) */
  maxColors: number;
  /**
   * 고정 팔레트 — 이 색들만 사용한다 (`#rrggbb` 소문자). 비었으면 자동.
   * 지정되면 colorPrecision·maxColors 는 무시된다 (VTracer palette).
   */
  palette: string[];
  /** 벡터화 전에 테두리와 연결된 배경을 투명하게 만든다 (background.ts) */
  removeBackground: boolean;
  /** 배경 제거 허용치 — 배경색과의 색 거리 (8~80, 기본 32) */
  bgTolerance: number;
  // ── 고급 ──────────────────────────────────────────────
  /** 코너로 인정할 각도(도) (0~180, 기본 60). 낮을수록 각이 살고, 높을수록 부드러워진다 */
  cornerThreshold: number;
  /** 이 길이(px)보다 짧은 경로 조각은 잇는다 (0~10, 기본 4) */
  lengthThreshold: number;
  /** 스플라인 이음새로 인정할 각도(도) (0~90, 기본 45) */
  spliceThreshold: number;
  /** SVG 좌표 소수 자릿수 (1~8, 기본 8). 낮추면 파일이 작아진다 */
  pathPrecision: number;
}

/**
 * AI 업스케일 파라미터 (Phase 3). 기획서 3장: "2배 우선, 4배는 검증 후 옵션".
 *
 * 모델은 x4 고정(Real-ESRGAN SRVGGNetCompact)이라, scale=2는 x4 결과를 0.5배로
 * 축소해 만든다.
 */
export interface UpscaleSettings {
  /** 최종 배율 (2 또는 4) */
  scale: 2 | 4;
}

/** 변환 설정 — 메인/워커가 공유 (7.4 메시지 규약) */
export interface ConvertSettings {
  /** 기본 raster. vector·upscale이면 output/quality/targetSize는 대부분 무시된다 */
  mode?: ConvertMode;
  /** 구체 출력 포맷. "원본 유지"는 start()에서 파일별로 이 값으로 확정된다 (5.6) */
  output: OutputFormat;
  resize: ResizeMode;
  quality: QualityMode;
  /** 메타데이터 제거 (5.6 기본 제거). false면 원본 메타데이터 유지 */
  stripMetadata: boolean;
  /** 투명 픽셀을 채울 배경색 (5.6, PNG/WebP → JPEG). 기본 흰색 */
  background?: string;
  /** 자르기 — 단일 파일에서만 (5.9) */
  crop?: CropRect;
  /** mode === "vector"일 때 사용 */
  vector?: VectorSettings;
  /** mode === "upscale"일 때 사용 */
  upscale?: UpscaleSettings;
}

export const DEFAULT_VECTOR: VectorSettings = {
  clustering: "color",
  curve: "spline",
  filterSpeckle: 4,
  colorPrecision: 6,
  layerDifference: 16,
  maxColors: 0,
  palette: [],
  removeBackground: false,
  bgTolerance: 32,
  cornerThreshold: 60,
  lengthThreshold: 4,
  spliceThreshold: 45,
  pathPrecision: 8,
};

/**
 * 미리캔버스(Miricanvas) 등은 SVG의 조각(path) 수가 많으면 업로드가 안 되거나
 * 느려진다 — 대략 30개가 실용 한계. 이 수를 넘으면 결과 화면에서 안내한다.
 */
export const MIRICANVAS_PATH_LIMIT = 30;

/**
 * 조각 수를 줄이는 파라미터 묶음 (미리캔버스 프리셋 / 빠른 조치).
 *
 * 조각이 수백 개로 튀는 원인은 대부분 "노이즈로 생긴 작은 조각"이지 색 수가 아니다.
 * (예: 색 6개짜리 로고가 안티에일리어싱 때문에 조각 300개·색 120개로 나온다.)
 * 그래서 잡티 제거·레이어 병합으로 노이즈만 걷어내고, **색 수는 강제로 줄이지 않는다.**
 * 그래도 부족하면 사용자가 결과를 보며 "색 수 제한"을 직접 낮춘다.
 */
export const MIRICANVAS_VECTOR: Partial<VectorSettings> = {
  curve: "spline",
  filterSpeckle: 12, // 노이즈로 생긴 작은 조각 제거 — 조각 수에 가장 큰 영향, 색은 유지
  layerDifference: 32, // 거의 같은 색 레이어를 병합
  colorPrecision: 6, // 기본값 유지 (색 뭉개지 않음)
  pathPrecision: 6,
  maxColors: 0, // 색 수는 강제로 줄이지 않는다 (자동)
};

export const DEFAULT_UPSCALE: UpscaleSettings = {
  scale: 2,
};

/**
 * 업스케일 크기 상한 (Phase 3).
 *
 * W3 타일 분할로 추론 자체의 메모리는 타일 하나(약 224²)로 묶인다. 남는 병목은
 * 목표 배율로 조립하는 캔버스와, 결과를 픽셀로 읽어낸 RGBA 버퍼다 —
 * 8192×8192 RGBA ≈ 256MB. 그래서 입력이 아니라 **결과 픽셀 수**로 막는다.
 * 초과 시 image-too-large (UI 에서 "크기를 줄여 주세요" 안내 — 기획서 3장).
 */
export const UPSCALE_MAX_OUTPUT_PX = 64_000_000; // 약 8000×8000
/** 결과와 무관한 입력 자체의 하드 상한 (조립 전 소스 캔버스) */
export const UPSCALE_MAX_INPUT_PX = 16_000_000; // 약 4000×4000

/** 벡터화 프리셋 (일정 8.5 W2) */
export const VECTOR_PRESETS: {
  id: string;
  label: string;
  settings: VectorSettings;
}[] = [
  {
    id: "logo",
    label: "로고·아이콘",
    settings: { ...DEFAULT_VECTOR },
  },
  {
    id: "illustration",
    label: "일러스트",
    settings: {
      ...DEFAULT_VECTOR,
      filterSpeckle: 2,
      colorPrecision: 8,
      layerDifference: 8,
    },
  },
  {
    id: "lineart",
    label: "선화(흑백)",
    settings: { ...DEFAULT_VECTOR, clustering: "bw", filterSpeckle: 4 },
  },
  {
    id: "pixel",
    label: "픽셀 아트",
    settings: {
      ...DEFAULT_VECTOR,
      curve: "pixel",
      filterSpeckle: 0,
      colorPrecision: 8,
    },
  },
  {
    id: "miricanvas",
    label: "미리캔버스",
    settings: { ...DEFAULT_VECTOR, ...MIRICANVAS_VECTOR },
  },
];

/** UI의 출력 포맷 선택 — "원본 유지"(keep) 포함 (5.6) */
export type OutputChoice = OutputFormat | "keep";

/** "원본 유지" 선택 시 소스 포맷을 구체 출력 포맷으로 매핑한다 (5.6). HEIC는 인코딩 불가 → JPEG */
export function resolveKeepFormat(source: SourceFormat): OutputFormat {
  switch (source) {
    case "png":
      return "png";
    case "webp":
      return "webp";
    case "bmp":
      return "bmp";
    case "gif":
      return "png"; // GIF 인코딩은 Canvas가 지원하지 않음 (7.3) — 무손실 PNG로
    case "jpeg":
    case "heic":
    case "avif":
    case "unknown":
      return "jpeg";
  }
}

/** 파이프라인 결과 — 출력 타입은 Blob으로 통일 (7.10, Phase 2 SVG도 Blob) */
export interface ConvertResult {
  blob: Blob;
  /** 결과 MIME (image/jpeg … 또는 image/svg+xml) */
  mime: string;
  width: number;
  height: number;
  /** 벡터화 결과인지 */
  vector?: boolean;
  /** SVG 조각(path) 수 — 벡터화 결과에만 (미리캔버스 안내용) */
  pathCount?: number;
  /** AI 업스케일 결과인지 */
  upscaled?: boolean;
  /** 적용된 배율 — 업스케일 결과에만 */
  scale?: number;
  /** 조립에 쓴 타일 수 — 업스케일 결과에만 (1 = 단일 추론) */
  tiles?: number;
  /** 입력의 투명도를 유지했는지 — 업스케일 결과에만 */
  keptAlpha?: boolean;
  /** 실제 적용된 품질값 (목표 용량 모드에서 이진 탐색 결과) */
  quality?: number;
  /** 목표 용량 모드에서 목표 이하 달성 여부 (5.8 / 5.14 — 미달 시 L3) */
  targetSize?: { requestedBytes: number; reached: boolean };
}

/** 오류 코드 (7.4). 사용자 메시지는 UI 계층에서 매핑 (5.14) */
export type ErrorCode =
  | "unsupported-format"
  | "decode-failed"
  | "encode-failed"
  | "heic-module-failed"
  | "target-size-unreachable"
  | "out-of-memory"
  | "vector-module-failed"
  | "vectorize-failed"
  | "upscale-module-failed"
  | "upscale-failed"
  | "image-too-large"
  | "aborted"
  | "unknown";

export class PipelineError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "PipelineError";
  }
}

export const OUTPUT_MIME: Record<OutputFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bmp: "image/bmp",
};

export const OUTPUT_EXT: Record<OutputFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  bmp: "bmp",
};

/** 품질 파라미터를 받는 출력 포맷인지 (7.3 인코딩 표) */
export function usesQuality(format: OutputFormat): boolean {
  return format === "jpeg" || format === "webp";
}

/** 알파 채널이 없는 출력 포맷인지 — 투명 픽셀을 배경색으로 채워야 한다 (5.6) */
export function isOpaqueFormat(format: OutputFormat): boolean {
  return format === "jpeg" || format === "bmp";
}
