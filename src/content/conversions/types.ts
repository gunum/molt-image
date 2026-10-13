/*
 * 랜딩 페이지별 텍스트 (7.2 content/, 7.8 SEO).
 * 각 페이지 본문은 최소 400자 이상, 해당 포맷에 특화된 내용으로 작성한다 (7.8).
 * 본문·FAQ는 서버에서 렌더링된 HTML에 반드시 포함된다.
 */

import type { ConvertSettings } from "@/core/types";

export interface FaqItem {
  q: string;
  a: string;
}

export interface ConversionContent {
  slug: string;
  path: string;
  /** <title> / og:title */
  title: string;
  /** meta description / og:description */
  description: string;
  /** 화면 제목 (h1) */
  heading: string;
  /** 한 줄 설명 */
  tagline: string;
  /** 5.12 랜딩 페이지 초기값 */
  initialSettings: ConvertSettings;
  /** "원본 유지" 출력 (5.6) */
  keepFormat?: boolean;
  /** `/heic-to-jpg`처럼 HEIC를 확실히 올릴 페이지는 libheif를 미리 로드 (7.6) */
  preloadHeic?: boolean;
  /** `/png-to-svg`처럼 벡터화 페이지는 VTracer WASM을 미리 로드 (7.6) */
  preloadVector?: boolean;
  body: { heading: string; text: string }[];
  faq: FaqItem[];
}
