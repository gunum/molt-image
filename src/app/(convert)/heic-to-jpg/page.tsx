import type { Metadata } from "next";
import ToolAreaLoader from "@/components/tool/ToolAreaLoader";
import LandingContent from "@/components/landing/LandingContent";
import OtherConversions from "@/components/landing/OtherConversions";
import { heicToJpg } from "@/content/conversions/heic-to-jpg";
import styles from "../landing.module.css";

/*
 * P-01 (5.1). 정적 생성 (7.8).
 * 도구는 클라이언트 전용, 설명·FAQ는 서버 렌더 HTML에 포함 (7.8).
 */

export const metadata: Metadata = {
  title: heicToJpg.title,
  description: heicToJpg.description,
  alternates: { canonical: heicToJpg.path },
};

export default function Page() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>{heicToJpg.heading}</h1>
      <p className={styles.tagline}>{heicToJpg.tagline}</p>
      <ToolAreaLoader initialSettings={heicToJpg.initialSettings} preloadHeic />
      <LandingContent content={heicToJpg} />
      <OtherConversions current={heicToJpg.path} />
    </main>
  );
}
