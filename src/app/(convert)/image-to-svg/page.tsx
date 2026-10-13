import type { Metadata } from "next";
import ToolAreaLoader from "@/components/tool/ToolAreaLoader";
import LandingContent from "@/components/landing/LandingContent";
import OtherConversions from "@/components/landing/OtherConversions";
import { imageToSvg } from "@/content/conversions/image-to-svg";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: imageToSvg.title,
  description: imageToSvg.description,
  alternates: { canonical: imageToSvg.path },
};

export default function Page() {
  return (
    <main className={styles.landing}>
      <h1 className={styles.h1}>{imageToSvg.heading}</h1>
      <p className={styles.tagline}>{imageToSvg.tagline}</p>
      <ToolAreaLoader
        initialSettings={imageToSvg.initialSettings}
        preloadVector
      />
      <LandingContent content={imageToSvg} />
      <OtherConversions current={imageToSvg.path} />
    </main>
  );
}
