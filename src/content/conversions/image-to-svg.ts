import { DEFAULT_VECTOR } from "@/core/types";
import type { ConversionContent } from "./types";

export const imageToSvg: ConversionContent = {
  slug: "image-to-svg",
  path: "/image-to-svg",
  title: "이미지를 SVG로 변환 (벡터화) — 서버 업로드 없이",
  description:
    "PNG·JPG·GIF·BMP·WebP 이미지를 확대해도 깨지지 않는 SVG 벡터로 바꿉니다. VTracer 엔진이 이 브라우저 안에서 처리하며 파일은 서버로 전송되지 않습니다.",
  heading: "이미지를 SVG로 바꾸기",
  tagline: "픽셀 이미지를 확대해도 깨지지 않는 벡터로 바꿉니다.",
  initialSettings: {
    mode: "vector",
    output: "png",
    resize: { kind: "keep" },
    quality: { kind: "quality", value: 85 },
    stripMetadata: true,
    vector: DEFAULT_VECTOR,
  },
  preloadVector: true,
  body: [
    {
      heading: "벡터와 래스터의 차이",
      text: "PNG·JPG·GIF·BMP·WebP는 모두 래스터 형식입니다 — 색이 칠해진 픽셀의 격자라서 확대하면 계단처럼 깨집니다. SVG는 점·선·면을 수식으로 기술하는 벡터라 아무리 키워도 경계가 매끄럽고, 로고·아이콘이라면 대개 원본보다 파일이 작습니다. 이 도구는 VTracer 엔진(WebAssembly)으로 픽셀 이미지의 색 영역을 추적해 SVG 경로를 만듭니다.",
    },
    {
      heading: "잘 맞는 이미지 / 안 맞는 이미지",
      text: "잘 맞음: 회사 로고, 앱 아이콘, 단순한 일러스트, 흑백 도안, 픽셀 아트 — 면이 넓고 색 수가 적은 이미지. 인쇄·간판·큰 화면에서 선명하고 파일도 작습니다. 안 맞음: 인물·풍경 사진처럼 색이 연속적으로 변하고 질감이 많은 이미지 — 벡터화하면 조각이 수만 개 생겨 SVG가 원본보다 수십 배 커지고 결과가 뭉개집니다. 도구가 파일을 분석해 사진에 가까우면 미리 알려줍니다.",
    },
    {
      heading: "프리셋과 미세 조정",
      text: "프리셋(로고·아이콘 / 일러스트 / 선화(흑백) / 픽셀 아트)으로 시작하세요. 색상 정밀도를 낮추면 색 수가 줄어 파일이 작아지고, 잡티 제거를 올리면 작은 얼룩이 사라집니다. 기하학적 로고는 '직선', 부드러운 형태는 '곡선'이 어울립니다. 변환된 항목을 클릭하면 원본과 SVG를 나란히 확대 비교할 수 있습니다.",
    },
  ],
  faq: [
    {
      q: "어떤 형식을 넣을 수 있나요?",
      a: "PNG, JPG, GIF(첫 프레임), BMP, WebP를 넣을 수 있습니다. 결과는 모두 SVG입니다.",
    },
    {
      q: "사진을 넣으면 어떻게 되나요?",
      a: "변환은 되지만 SVG 파일이 원본보다 훨씬 커지고 결과가 부정확합니다. 도구가 분석해 사진에 가까우면 변환 전에 경고합니다.",
    },
    {
      q: "여러 장을 한 번에?",
      a: "네. 병렬로 처리하고 두 장 이상이면 ZIP으로 받습니다. 벡터화는 이미지 변환보다 느리므로 장수가 많으면 시간이 걸립니다.",
    },
    {
      q: "파일이 서버로 올라가나요?",
      a: "아니요. 벡터화 엔진을 브라우저가 한 번 내려받은 뒤 이미지 처리는 전부 이 기기 안에서 이루어집니다. 개발자도구 네트워크 탭으로 확인할 수 있습니다.",
    },
  ],
};
