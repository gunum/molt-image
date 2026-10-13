import type { NextConfig } from "next";

// 7.7 배포와 헤더
// COOP/COEP는 Phase 1 기능(Canvas + 단일 스레드 libheif)에는 필요 없지만,
// Phase 3(ONNX Runtime 멀티스레드)에서 반드시 필요해지므로 처음부터 켜 둔다.
// 켜면 외부 리소스가 CORP 헤더를 가져야 로드되므로 폰트는 자체 호스팅한다(7.7).
const crossOriginIsolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: crossOriginIsolation,
      },
      {
        // 7.7 정적 자산 — 콘텐츠 해시가 붙는 청크는 무기한 캐시
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // WASM 런타임·벡터화 엔진·업스케일 모델 — 버전 고정 자산, 길게 캐시
        // (파일명 해시는 W5 배포 항목. 그전까지는 max-age 로만)
        source: "/:path(wasm|ort|models)/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000" },
        ],
      },
    ];
  },
};

export default nextConfig;
