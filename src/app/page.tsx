import type { Metadata } from "next";
import ToolAreaLoader from "@/components/tool/ToolAreaLoader";
import { DEFAULT_KEEP_FORMAT, DEFAULT_SETTINGS } from "@/store/useSettingsStore";

/*
 * P-00 통합 도구 (5.1). 정적 생성 (7.8) — 진입점.
 * 재방문자용 — lastSettings를 복원한다 (5.13).
 */

export const metadata: Metadata = {
  title: "이미지 변환",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <main>
      <ToolAreaLoader
        initialSettings={DEFAULT_SETTINGS}
        keepFormat={DEFAULT_KEEP_FORMAT}
        restoreLast
      />
    </main>
  );
}
