/*
 * Phase 3 업스케일 자산 준비 (일정 8.6 M4).
 *
 *   1. onnxruntime-web 런타임(.wasm/.mjs)을 node_modules 에서 public/ort/ 로 복사
 *      → 7.7 "자체 호스팅" (COOP/COEP 하에서 CDN 로딩이 막힐 수 있으므로)
 *   2. Real-ESRGAN 모델(realesr-general-x4v3.onnx)을 없으면 내려받고 SHA-256 검증
 *
 * public/ort/, public/models/*.onnx 는 .gitignore 대상 — 이 스크립트가 복원한다.
 * npm install 후 postinstall 로 자동 실행되며, 네트워크가 없어도 install 을 막지 않는다.
 * 수동 실행: npm run vendor:upscale
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 1. ONNX Runtime Web 런타임 복사 ──────────────────────────────
const ORT_DIST = join(dirname(require.resolve("onnxruntime-web")), ".");
const ORT_OUT = join(root, "public", "ort");
// webgpu 진입점이 로드하는 JSEP(WebGPU) 빌드 + CPU 폴백 빌드 양쪽
const ORT_FILES = [
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
];

mkdirSync(ORT_OUT, { recursive: true });
let copied = 0;
for (const f of ORT_FILES) {
  const from = join(ORT_DIST, f);
  if (!existsSync(from)) {
    console.warn(`[setup-upscale] onnxruntime-web 에 ${f} 가 없습니다 — 건너뜀`);
    continue;
  }
  copyFileSync(from, join(ORT_OUT, f));
  copied++;
}
console.log(`[setup-upscale] ORT 런타임 ${copied}개 파일 → public/ort/`);

// ── 2. 업스케일 모델 내려받기 + 검증 ────────────────────────────
const MODEL_DIR = join(root, "public", "models");
const MODEL_PATH = join(MODEL_DIR, "realesr-general-x4v3.onnx");
const MODEL_SHA256 =
  "09b757accd747d7e423c1d352b3e8f23e77cc5742d04bae958d4eb8082b76fa4";
// 커밋 해시로 고정 (내용은 SHA-256 으로 검증하므로 출처가 바뀌어도 안전)
const MODEL_URL =
  "https://huggingface.co/OwlMaster/AllFilesRope/resolve/d783e61585b3d83a85c91ca8a3b299e8ade94d72/realesr-general-x4v3.onnx";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

mkdirSync(MODEL_DIR, { recursive: true });

if (existsSync(MODEL_PATH) && sha256(MODEL_PATH) === MODEL_SHA256) {
  const kb = (statSync(MODEL_PATH).size / 1024).toFixed(0);
  console.log(`[setup-upscale] 모델 이미 있음 (${kb} KB, 해시 일치)`);
} else {
  try {
    console.log(`[setup-upscale] 모델 내려받는 중… ${MODEL_URL}`);
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(MODEL_PATH, buf);
    const got = sha256(MODEL_PATH);
    if (got !== MODEL_SHA256) {
      throw new Error(`SHA-256 불일치\n  기대: ${MODEL_SHA256}\n  실제: ${got}`);
    }
    console.log(
      `[setup-upscale] 모델 저장 완료 (${(buf.length / 1024).toFixed(0)} KB, 해시 일치)`,
    );
  } catch (err) {
    console.warn(
      `[setup-upscale] 모델 준비 실패 — 업스케일 기능은 이 파일이 있어야 동작합니다.\n` +
        `  나중에 'npm run vendor:upscale' 로 다시 시도하세요.\n  원인: ${err.message}`,
    );
  }
}
