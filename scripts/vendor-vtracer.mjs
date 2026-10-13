/*
 * @visioncortex/vtracer 는 wasm-pack --target nodejs 로 빌드돼 있어 브라우저에서
 * 그대로 못 쓴다 (fs.readFileSync 로 wasm 로드, CJS exports). 이 스크립트가
 * pkg/vtracer_wasm.js 를 ESM + 브라우저 init 으로 바꿔 src/vendor/ 에, wasm 을
 * public/wasm/ 에 복사한다.
 *
 *   node scripts/vendor-vtracer.mjs
 *
 * wasm-bindgen glue 코드 자체(포인터 마샬링·문자열 인코딩·imports)는 브라우저와
 * 동일하므로 손대지 않는다. 바꾸는 것은 마지막 부트스트랩 6줄과 exports 2줄뿐이다.
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgDir = require
  .resolve("@visioncortex/vtracer/package.json")
  .replace(/package\.json$/, "");

const VERSION = require("@visioncortex/vtracer/package.json").version;

let src = readFileSync(`${pkgDir}pkg/vtracer_wasm.js`, "utf8");

// CJS exports 제거
src = src.replace(/^exports\.vectorize_bytes = vectorize_bytes;\s*$/m, "");
src = src.replace(/^exports\.vectorize_rgba = vectorize_rgba;\s*$/m, "");

// Node 부트스트랩(fs.readFileSync)을 브라우저 init 으로 교체
src = src.replace(
  /const wasmPath = [\s\S]*?wasm\.__wbindgen_start\(\);\s*$/,
  `let wasm;

/** 브라우저/워커에서 wasm 을 인스턴스화한다. 최초 1회만 유효. */
export async function initVtracer(wasmUrl) {
  if (wasm) return;
  const bytes = await (await fetch(wasmUrl)).arrayBuffer();
  const mod = new WebAssembly.Module(bytes);
  const inst = new WebAssembly.Instance(mod, __wbg_get_imports());
  wasm = inst.exports;
  wasm.__wbindgen_start();
}

export { vectorize_bytes, vectorize_rgba };
`,
);

const header = `/*
 * VENDORED — @visioncortex/vtracer@${VERSION} / pkg/vtracer_wasm.js
 * 생성: scripts/vendor-vtracer.mjs (직접 편집하지 말 것)
 * 라이선스: MIT OR Apache-2.0
 */
`;

mkdirSync(new URL("../src/vendor/vtracer/", import.meta.url), { recursive: true });
mkdirSync(new URL("../public/wasm/", import.meta.url), { recursive: true });

writeFileSync(
  new URL("../src/vendor/vtracer/vtracer_wasm.mjs", import.meta.url),
  header + src,
);
// 타입은 vtracer_wasm.d.mts 에서 손으로 관리한다 (여기서 덮어쓰지 않음)
copyFileSync(
  `${pkgDir}pkg/vtracer_wasm_bg.wasm`,
  new URL("../public/wasm/vtracer.wasm", import.meta.url),
);

console.log(`vendored @visioncortex/vtracer@${VERSION}`);
console.log(" → src/vendor/vtracer/vtracer_wasm.mjs");
console.log(" → public/wasm/vtracer.wasm");
