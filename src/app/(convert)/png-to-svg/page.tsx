import type { Metadata } from "next";
import ToolAreaLoader from "@/components/tool/ToolAreaLoader";
import LandingContent from "@/components/landing/LandingContent";
import OtherConversions from "@/components/landing/OtherConversions";
import { pngToSvg } from "@/content/conversions/png-to-svg";
import styles from "../landing.module.css";

/*
 * P-06 벡터화 랜딩 (일정 8.5 M3 W3). 정적 생성 (7.8).
 * mode: "vector" 초기값 + VTracer WASM 프리로드.
 */

export const metadata: Metadata = {
  title: pngToSvg.title,
  description: pngToSvg.description,
  alternates: { canonical: pngToSvg.path },
};

export default function Page() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>{pngToSvg.heading}</h1>
      <p className={styles.tagline}>{pngToSvg.tagline}</p>
      <ToolAreaLoader
        initialSettings={pngToSvg.initialSettings}
        preloadVector
      />
      <LandingContent content={pngToSvg} />
      <OtherConversions current={pngToSvg.path} />
    </main>
  );
}
