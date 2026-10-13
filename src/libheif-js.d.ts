/*
 * libheif-js는 wasm 번들 서브패스에 타입을 제공하지 않는다.
 * core/decode.ts가 실제로 쓰는 표면만 좁게 선언한다 (7.6).
 */
declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(image: ImageData, cb: (data: ImageData | null) => void): void;
    free?(): void;
  }
  interface HeifDecoder {
    decode(buffer: Uint8Array): HeifImage[];
  }
  /** emscripten 팩토리 — 호출하면 컴파일된 Module을 반환한다 */
  const factory: () => { HeifDecoder: new () => HeifDecoder };
  export default factory;
}
