/*
 * 7.4 워커 메시지 규약.
 *
 * File·Blob은 구조화 복제 대상이라 실제 데이터 복사 없이 전달된다.
 * ImageBitmap을 주고받을 일이 생기면 transfer 목록에 넣어 소유권을 넘긴다.
 */

import type { ConvertSettings, ErrorCode } from "@/core/types";

/** 메인 → 워커 */
export interface ConvertRequest {
  id: string;
  file: File;
  settings: ConvertSettings;
}

/** 워커 → 메인 */
export type ConvertResponse =
  | { id: string; type: "progress"; ratio: number }
  | {
      id: string;
      type: "done";
      blob: Blob;
      mime: string;
      width: number;
      height: number;
      vector?: boolean;
      pathCount?: number;
      upscaled?: boolean;
      scale?: number;
      tiles?: number;
      keptAlpha?: boolean;
      quality?: number;
      targetSize?: { requestedBytes: number; reached: boolean };
    }
  | { id: string; type: "error"; reason: ErrorCode };
