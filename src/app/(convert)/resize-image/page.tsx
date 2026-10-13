import type { Metadata } from "next";
import ToolAreaLoader from "@/components/tool/ToolAreaLoader";
import OtherConversions from "@/components/landing/OtherConversions";
import type { ConvertSettings } from "@/core/types";
import styles from "../landing.module.css";

// P-05 (5.1). 초기값 (5.12): 원본 유지 / 긴 변 1920 / 품질 90.

const initial: ConvertSettings = {
  output: "jpeg", // keepFormat=true이므로 파일별 소스 포맷으로 확정됨
  resize: { kind: "longEdge", px: 1920 },
  quality: { kind: "quality", value: 90 },
  stripMetadata: true,
};

export const metadata: Metadata = {
  title: "이미지 크기 변경",
  description:
    "이미지의 가로·세로 크기를 바꿉니다. 파일은 이 기기에서만 처리됩니다.",
  alternates: { canonical: "/resize-image" },
};

export default function Page() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>이미지 크기 변경</h1>
      <p className={styles.tagline}>긴 변 기준으로 비율을 유지하며 줄입니다.</p>
      <ToolAreaLoader initialSettings={initial} keepFormat />
      <OtherConversions current="/resize-image" />
    </main>
  );
}
