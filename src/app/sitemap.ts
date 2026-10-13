import type { MetadataRoute } from "next";

// 7.8 SEO — 랜딩 페이지 색인. W5에서 본문이 채워지면 확정.
const BASE = "https://moltimage.app";

const paths = [
  "/",
  "/heic-to-jpg",
  "/png-to-webp",
  "/jpg-to-png",
  "/png-to-svg",
  "/jpg-to-svg",
  "/image-to-svg",
  "/compress-image",
  "/resize-image",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return paths.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.8,
  }));
}
