import type { Metadata } from "next";
import ToolAreaLoader from "@/components/tool/ToolAreaLoader";
import OtherConversions from "@/components/landing/OtherConversions";
import type { ConvertSettings } from "@/core/types";
import styles from "../landing.module.css";

// P-04 (5.1). 초기값 (5.12): 원본 유지 / 원본 유지 / 목표 용량 1MB.

const initial: ConvertSettings = {
  output: "jpeg", // keepFormat=true이므로 파일별 소스 포맷으로 확정됨
  resize: { kind: "keep" },
  quality: { kind: "targetSize", bytes: 1024 * 1024 },
  stripMetadata: true,
};

export const metadata: Metadata = {
  title: "이미지 압축",
  description:
    "목표 용량에 맞춰 이미지를 압축합니다. 파일은 이 기기에서만 처리됩니다.",
  alternates: { canonical: "/compress-image" },
};

export default function Page() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>이미지 압축</h1>
      <p className={styles.tagline}>업로드 용량 제한에 맞춰 크기를 줄입니다.</p>
      <ToolAreaLoader initialSettings={initial} keepFormat />
      <OtherConversions current="/compress-image" />
    </main>
  );
}
