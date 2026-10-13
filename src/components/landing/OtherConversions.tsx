/*
 * 하단 "다른 변환" 링크 (6.5). 내부 링크 구조를 만들어 색인에 도움을 준다.
 */

import Link from "next/link";

const ALL = [
  { path: "/heic-to-jpg", label: "HEIC → JPG" },
  { path: "/png-to-webp", label: "PNG → WebP" },
  { path: "/jpg-to-png", label: "JPG → PNG" },
  { path: "/png-to-svg", label: "PNG → SVG (벡터화)" },
  { path: "/jpg-to-svg", label: "JPG → SVG (벡터화)" },
  { path: "/image-to-svg", label: "이미지 → SVG (벡터화)" },
  { path: "/compress-image", label: "이미지 압축" },
  { path: "/resize-image", label: "크기 변경" },
];

export default function OtherConversions({ current }: { current: string }) {
  return (
    <nav aria-label="다른 변환">
      <h2>다른 변환</h2>
      <ul>
        {ALL.filter((c) => c.path !== current).map((c) => (
          <li key={c.path}>
            <Link href={c.path}>{c.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
