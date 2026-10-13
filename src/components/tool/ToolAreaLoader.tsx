"use client";

/*
 * 7.8 렌더링 전략 — 도구는 `dynamic(() => import(...), { ssr: false })`로
 * 클라이언트 전용 렌더링한다. 브라우저 API(Canvas, Worker) 의존.
 * 페이지의 설명·FAQ는 서버에서 렌더링된 HTML에 그대로 남는다.
 */

import dynamic from "next/dynamic";
import type { ConvertSettings } from "@/core/types";

const ToolArea = dynamic(() => import("./ToolArea"), {
  ssr: false,
  loading: () => <div style={{ minHeight: 360 }} />,
});

export default function ToolAreaLoader(props: {
  initialSettings: ConvertSettings;
  restoreLast?: boolean;
  keepFormat?: boolean;
  preloadHeic?: boolean;
  preloadVector?: boolean;
}) {
  return <ToolArea {...props} />;
}
