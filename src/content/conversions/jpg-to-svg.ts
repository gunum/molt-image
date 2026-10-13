import { DEFAULT_VECTOR } from "@/core/types";
import type { ConversionContent } from "./types";

export const jpgToSvg: ConversionContent = {
  slug: "jpg-to-svg",
  path: "/jpg-to-svg",
  title: "JPG를 SVG로 변환 (벡터화) — 서버 업로드 없이",
  description:
    "JPG 로고·도안을 확대해도 깨지지 않는 SVG 벡터로 바꿉니다. VTracer 엔진이 이 브라우저 안에서 처리하며 파일은 서버로 전송되지 않습니다.",
  heading: "JPG를 SVG로 바꾸기",
  tagline: "JPG로 저장된 로고·도안을 벡터로 되살립니다.",
  initialSettings: {
    mode: "vector",
    output: "jpeg",
    resize: { kind: "keep" },
    quality: { kind: "quality", value: 85 },
    stripMetadata: true,
    vector: DEFAULT_VECTOR,
  },
  preloadVector: true,
  body: [
    {
      heading: "JPG를 벡터로 바꿀 때 주의할 점",
      text: "JPG는 손실 압축이라 색 경계 주변에 미세한 얼룩(블록 노이즈)이 생깁니다. 벡터화는 색 경계를 따라 선을 그리므로 이 얼룩까지 형태로 잡아내 결과가 지저분해지기 쉽습니다. '잡티 제거' 값을 평소보다 높이고, 색상 정밀도를 낮춰 비슷한 색을 묶으면 훨씬 깔끔해집니다. 원본이 PNG로도 있다면 PNG를 쓰는 편이 낫습니다.",
    },
    {
      heading: "어떤 JPG가 잘 맞나요",
      text: "면이 넓고 색이 단순한 이미지 — 회사 로고 JPG, 흑백 도장·서명 스캔, 단순한 아이콘, 명함에 인쇄된 심벌 — 이 잘 됩니다. 특히 '선화(흑백)' 프리셋은 배경의 미세한 색 변화를 무시하고 검정 선만 추출하므로, 스캔한 도안을 벡터로 만들 때 유용합니다. 반대로 인물·풍경 사진 JPG는 벡터화하면 조각이 수만 개 생겨 파일이 커지고 뭉개집니다.",
    },
    {
      heading: "결과 확인",
      text: "변환된 항목을 클릭하면 원본과 SVG를 나란히 놓고 확대해 비교할 수 있습니다. 확대해도 SVG 쪽 경계가 매끄러운지, 원치 않는 얼룩이 형태로 남지 않았는지 확인하세요. 마음에 들지 않으면 프리셋이나 파라미터를 바꿔 다시 변환하면 됩니다.",
    },
  ],
  faq: [
    {
      q: "JPG 노이즈가 결과에 남나요?",
      a: "그대로 두면 남습니다. '잡티 제거' 값을 8~12로 올리고 색상 정밀도를 4~5로 낮추면 대부분 사라집니다. 흑백 도안은 '선화' 프리셋이 가장 깔끔합니다.",
    },
    {
      q: "사진 JPG도 되나요?",
      a: "기술적으로는 되지만 결과가 크고 부정확합니다. 도구가 파일을 분석해 사진에 가까우면 변환 전에 경고합니다.",
    },
    {
      q: "파일이 서버로 올라가나요?",
      a: "아니요. 벡터화 엔진을 브라우저가 한 번 내려받은 뒤, 이미지 처리는 전부 이 기기 안에서 이루어집니다.",
    },
  ],
};
