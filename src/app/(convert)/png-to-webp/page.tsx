import type { Metadata } from "next";
import ToolAreaLoader from "@/components/tool/ToolAreaLoader";
import OtherConversions from "@/components/landing/OtherConversions";
import type { ConvertSettings } from "@/core/types";
import styles from "../landing.module.css";

// P-02 (5.1). 초기값 (5.12): WebP / 원본 유지 / 품질 85.
// TODO(W5): 본문·FAQ (content/conversions/png-to-webp.ts).

const initial: ConvertSettings = {
  output: "webp",
  resize: { kind: "keep" },
  quality: { kind: "quality", value: 85 },
  stripMetadata: true,
};

export const metadata: Metadata = {
  title: "PNG를 WebP로 변환",
  description:
    "PNG를 더 가벼운 WebP로 바꿉니다. 파일은 이 기기에서만 처리됩니다.",
  alternates: { canonical: "/png-to-webp" },
};

export default function Page() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>PNG를 WebP로 바꾸기</h1>
      <p className={styles.tagline}>같은 화질을 더 작은 용량으로 저장합니다.</p>
      <ToolAreaLoader initialSettings={initial} />
      <OtherConversions current="/png-to-webp" />
    </main>
  );
}
