import type { Metadata } from "next";
import ToolAreaLoader from "@/components/tool/ToolAreaLoader";
import OtherConversions from "@/components/landing/OtherConversions";
import type { ConvertSettings } from "@/core/types";
import styles from "../landing.module.css";

// P-03 (5.1). 초기값 (5.12): PNG / 원본 유지 / 품질 없음(무손실).

const initial: ConvertSettings = {
  output: "png",
  resize: { kind: "keep" },
  quality: { kind: "quality", value: 85 },
  stripMetadata: true,
};

export const metadata: Metadata = {
  title: "JPG를 PNG로 변환",
  description: "JPG를 PNG로 바꿉니다. 파일은 이 기기에서만 처리됩니다.",
  alternates: { canonical: "/jpg-to-png" },
};

export default function Page() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>JPG를 PNG로 바꾸기</h1>
      <p className={styles.tagline}>
        편집·투명 배경 작업에 쓰기 좋은 형식으로 바꿉니다.
      </p>
      <ToolAreaLoader initialSettings={initial} />
      <OtherConversions current="/jpg-to-png" />
    </main>
  );
}
