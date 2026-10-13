import type { Metadata } from "next";
import ToolAreaLoader from "@/components/tool/ToolAreaLoader";
import LandingContent from "@/components/landing/LandingContent";
import OtherConversions from "@/components/landing/OtherConversions";
import { jpgToSvg } from "@/content/conversions/jpg-to-svg";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: jpgToSvg.title,
  description: jpgToSvg.description,
  alternates: { canonical: jpgToSvg.path },
};

export default function Page() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>{jpgToSvg.heading}</h1>
      <p className={styles.tagline}>{jpgToSvg.tagline}</p>
      <ToolAreaLoader initialSettings={jpgToSvg.initialSettings} preloadVector />
      <LandingContent content={jpgToSvg} />
      <OtherConversions current={jpgToSvg.path} />
    </main>
  );
}
