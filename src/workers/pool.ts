/*
 * 7.4 워커 풀 관리.
 *
 * - N = min(hardwareConcurrency - 1, 4). 상한 4는 M0 실측으로 확정.
 * - 워커는 앱 시작 시가 아니라 첫 변환 시작 시 생성한다 (createRunner 호출 시점).
 * - 파일 단위로 큐에 넣고 순차 배분한다. 파일 하나가 워커 하나를 점유한다.
 * - 취소: 모든 워커를 terminate하고 대기 큐를 비운다. 이미 완료된 결과는 유지한다 (5.10).
 * - 워커 생성 실패 시 메인 스레드 단일 처리로 폴백한다 (5.10). 느려짐은 UI가 알린다.
 *
 * 파일마다 설정이 다를 수 있다 ("원본 유지" 출력 포맷은 파일별로 확정됨, 5.6) —
 * Job이 자신의 ConvertSettings를 들고 다닌다.
 *
 * TODO(7.6): HEIC용 WASM Module을 메인에서 한 번 컴파일해 각 워커로 구조화 복제 전달.
 *   현재는 워커마다 libheif를 지연 import 한다 (HEIC를 쓸 때만).
 */

import { runPipeline } from "@/core/pipeline";
import { PipelineError, type ConvertSettings } from "@/core/types";
import type { ConvertRequest, ConvertResponse } from "./protocol";

export const MAX_WORKERS = 4;

export function resolvePoolSize(): number {
  const hc =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(hc - 1, MAX_WORKERS));
}

export interface Job {
  id: string;
  file: File;
  settings: ConvertSettings;
}

export interface DonePayload {
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

export interface RunnerHandlers {
  onProgress: (id: string, ratio: number) => void;
  onDone: (id: string, payload: DonePayload) => void;
  onError: (id: string, reason: string) => void;
  /** 모든 작업이 끝났거나 취소로 종료됨 */
  onSettled: () => void;
}

export interface Runner {
  /** 폴백(메인 스레드 단일 처리) 모드인지 (5.10) */
  readonly fallback: boolean;
  cancel: () => void;
}

function spawnWorker(): Worker {
  return new Worker(new URL("./convert.worker.ts", import.meta.url), {
    type: "module",
  });
}

/**
 * jobs를 병렬 변환한다. 첫 호출에서 워커를 생성한다.
 * 워커를 만들 수 없으면 메인 스레드에서 순차 처리한다.
 */
export function createRunner(jobs: Job[], handlers: RunnerHandlers): Runner {
  const queue = [...jobs];
  let cancelled = false;
  let remaining = jobs.length;

  const finishOne = (dispatchNext?: () => void) => {
    remaining--;
    if (remaining <= 0) {
      teardown();
      handlers.onSettled();
    } else {
      dispatchNext?.();
    }
  };

  // ── 폴백: 메인 스레드 순차 처리 ────────────────────────────────
  const runOnMain = () => {
    (async () => {
      for (const job of queue) {
        if (cancelled) break;
        try {
          const r = await runPipeline(job.file, job.settings, {
            onProgress: (ratio) => handlers.onProgress(job.id, ratio),
          });
          if (cancelled) break;
          handlers.onDone(job.id, r);
        } catch (err) {
          if (cancelled) break;
          handlers.onError(
            job.id,
            err instanceof PipelineError ? err.code : "unknown",
          );
        }
        remaining--;
      }
      if (!cancelled) handlers.onSettled();
    })();
  };

  let workers: Worker[] = [];
  const teardown = () => {
    for (const w of workers) w.terminate();
    workers = [];
  };

  try {
    const size = Math.min(resolvePoolSize(), jobs.length || 1);
    workers = Array.from({ length: size }, spawnWorker);
  } catch {
    runOnMain();
    return {
      fallback: true,
      cancel: () => {
        cancelled = true;
      },
    };
  }

  // ── 정상: 워커 풀 ─────────────────────────────────────────────
  const busy = new Map<Worker, string>();

  const dispatch = (worker: Worker) => {
    if (cancelled) return;
    const job = queue.shift();
    if (!job) return;
    busy.set(worker, job.id);
    const req: ConvertRequest = {
      id: job.id,
      file: job.file,
      settings: job.settings,
    };
    worker.postMessage(req);
  };

  const onMessage = (worker: Worker, e: MessageEvent<ConvertResponse>) => {
    const msg = e.data;
    if (cancelled) return;
    if (msg.type === "progress") {
      handlers.onProgress(msg.id, msg.ratio);
      return;
    }
    if (msg.type === "done") handlers.onDone(msg.id, msg);
    else handlers.onError(msg.id, msg.reason);
    busy.delete(worker);
    finishOne(() => dispatch(worker));
  };

  for (const worker of workers) {
    worker.onmessage = (e) => onMessage(worker, e);
    worker.onerror = () => {
      const id = busy.get(worker);
      if (!id || cancelled) return;
      // 워커 자체가 죽었으면 새로 하나 띄워 큐를 계속 소화한다 (5.10)
      handlers.onError(id, "unknown");
      busy.delete(worker);
      finishOne(() => {
        try {
          const w = spawnWorker();
          w.onmessage = (e) => onMessage(w, e);
          w.onerror = worker.onerror;
          workers.push(w);
          dispatch(w);
        } catch {
          /* 더는 못 만들면 남은 큐는 소화되지 못한다 — 다음 onSettled에서 종료 */
        }
      });
    };
    dispatch(worker);
  }

  return {
    fallback: false,
    cancel: () => {
      cancelled = true;
      teardown();
      handlers.onSettled();
    },
  };
}
