/*
 * 7.4 변환 워커.
 *
 * 파일 하나를 받아 core/pipeline으로 변환하고 진행률·결과·오류를 메인에 보고한다.
 * 파일 하나가 워커 하나를 점유한다 (7.4). 파일 내부를 쪼개 병렬화하지 않는다.
 *
 * 취소: 풀이 worker.terminate()로 중단한다 (7.4 — "현재 단계 종료 후 중단",
 * 이미 완료된 결과는 유지). 워커 안에서 별도 취소 신호를 처리하지 않는다.
 */

import { runPipeline } from "@/core/pipeline";
import { PipelineError } from "@/core/types";
import type { ConvertRequest, ConvertResponse } from "./protocol";

const post = (msg: ConvertResponse) => {
  (self as unknown as Worker).postMessage(msg);
};

self.onmessage = async (e: MessageEvent<ConvertRequest>) => {
  const { id, file, settings } = e.data;
  try {
    const result = await runPipeline(file, settings, {
      onProgress: (ratio) => post({ id, type: "progress", ratio }),
    });
    post({
      id,
      type: "done",
      blob: result.blob,
      mime: result.mime,
      width: result.width,
      height: result.height,
      vector: result.vector,
      pathCount: result.pathCount,
      upscaled: result.upscaled,
      scale: result.scale,
      tiles: result.tiles,
      keptAlpha: result.keptAlpha,
      quality: result.quality,
      targetSize: result.targetSize,
    });
  } catch (err) {
    const reason =
      err instanceof PipelineError ? err.code : "unknown";
    post({ id, type: "error", reason });
  }
};
