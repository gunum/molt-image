import { notFound } from "next/navigation";
import PipelineHarness from "./PipelineHarness";

/*
 * 개발 전용 — core/ 파이프라인 수동 점검 도구. 제품 UI(6장)가 아니다.
 * W3에서 실제 도구가 만들어지면 삭제한다. 프로덕션 빌드에서는 404.
 */
export default function DevPage() {
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_DEV_HARNESS)
    notFound();
  return <PipelineHarness />;
}
