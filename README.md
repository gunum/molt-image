# Molt Image

브라우저에서 이미지를 변환·압축·크기변경하는 도구. 파일은 서버로 전송되지 않고 이 기기에서만 처리된다.

기획 문서: `Downloads/files/MoltImage_*.md` (기획서 v0.2, 기능명세 Phase1 v0.3, 기술구조 Phase1 v0.2, 화면설계 Phase1 v0.2, 일정 v0.2).

## 현재 상태 — M4 (Phase 3 업스케일) W1~4 진행 중

Phase 1(M1 W1~W4)·Phase 2(M3 W1~W3)는 기능 완성, 미배포. 배포는 도메인 확보 후.
사용자 결정으로 벡터화에 이어 업스케일을 배포 전에 진행 (일정 8.6 M4).

### M4 W4 — 알파 채널 확대

- 모델은 RGB 만 받는다. 투명도가 있는 입력은 **알파를 따로** 처리:
  - `isFullyOpaque()` 스캔 — 완전 불투명이면 이 경로 전부 건너뜀 (사진 = 비용 0)
  - **RGB**: 타일 추론 전에 `bleedToOpaqueRGB()` — 투명 영역 RGB 를 인접 불투명 색으로
    번지게 하고(8회 확산) 알파를 255 로. 안 하면 모델이 투명부의 검정 RGB 를 끌어와
    경계에 검은 테두리가 생기고, 캔버스 프리멀티플라이 왕복에서 번진 색이 지워진다.
    씨앗 기준 알파 24 — 반투명 채움 색(예: 50% 초록)은 살린다
  - **알파**: 회색조로 옮겨 이중선형 확대(`upscaleAlpha()`) — 프리멀티플라이 왜곡 없음
  - 조립된 불투명 RGB 결과에 확대한 알파를 덮어 재결합
- `UpscaleOutput.hadAlpha`, `ConvertResult.keptAlpha`(= hadAlpha && 출력이 알파 지원 포맷),
  워커 규약에 `tiles`/`keptAlpha` 전달. `/dev` 로그에 "알파 유지" 표시
- **검증(프로덕션 빌드, WASM EP)**: 하드 경계 누끼 원 + 반투명 초록 채움 300×220 →x2:
  경계 반투명 픽셀 RGB `[86,123,140]` = 원 내부색 (블리딩 전 `[0,4,4]` 검정 → 해결) |
  50% 초록 채움 `a128 rgb[2,169,0]` 유지 (원본 `[0,169,0]`) |
  불투명 이미지 → "알파 유지" 없음, 결과 완전 불투명 (회귀 없음)
- **남는 한계**: 아주 낮은 알파(<24)의 언프리멀티플라이 RGB 정밀도 손실은 중립 회색 대체.
  합성 시 거의 안 보임. 취소(AbortSignal) 세분화·타일 크기 튜닝은 W7~8

### M4 W3 — 타일 분할 · 메모리 상한 · 타일 단위 진행률

- **`upscaleImage(src, settings, onProgress)`** (`core/upscale.ts`) — 단일 추론 함수를
  대체. 입력을 `TILE=224` 크기로 나누고 `PAD=16` 만큼 겹쳐 추론, 겹친 가장자리를
  잘라 **목표 배율 캔버스**에 조립. 224² 이하면 타일 없이 한 번에
- **메모리**: 전체 x4 캔버스를 만들지 않는다. 각 타일의 x4 결과를 `drawImage` 한 단계로
  목표 배율(scale=2 → 0.5배)로 줄이며 배치 → 상주 메모리 = "타일 하나 x4 + 목표 배율 조립 캔버스".
  scale=2 는 입력의 4배 픽셀만 상주 (16배가 아니라)
- **상한**: `UPSCALE_MAX_OUTPUT_PX` 6400만(약 8000²) — 결과 픽셀 기준.
  `UPSCALE_MAX_INPUT_PX` 1600만(약 4000²) — 소스 캔버스 기준. 초과 시 `image-too-large`
- **진행률**: 완료 타일 수 / 전체 타일 수 → 파이프라인 0.6~0.95 구간. 워커가 그대로 중계
- `ConvertResult.tiles` 추가 (조립 타일 수). `/dev` 하니스에 진행률 % 표시 + 로그에 타일 수
- **검증(프로덕션 빌드, WASM EP, 8코어 Mac)**:
  500×360 →x2→ 1000×720 · 타일 6 · 14초 |
  500×360 →x4→ 2000×1440 · 타일 6 · 20초 |
  이음새 계측: 세로 경계 열 차이 1.12(주변 평균 3.87 이하), 가로 경계 행 0.62 vs 0.15
  (절대 약 0.24% — 육안 불가) |
  4100×4100 입력 → `image-too-large` | 2100×2100 x4 → 결과 8400² → `image-too-large`
- **다음**: W5 WebGPU/WASM 분기(속도). W6 `/upscale-image` 랜딩·UI·예상 시간.
  W7~8 성능 튜닝·실기기

### M4 W1~2 — ONNX Runtime Web 연동 · 모델 선정 · 단일 이미지 추론

- **모델**: `realesr-general-x4v3` (Real-ESRGAN SRVGGNetCompact, 약 4.8MB, BSD-3).
  x4 고정. `input [1,3,H,W] f32 RGB 0~1` → `output [1,3,H*4,W*4]`. scale=2 는 x4 결과를
  단계적 축소로 만든다. `scripts/setup-upscale.mjs` 가 커밋 해시 고정 + SHA-256 검증으로 내려받음
- **런타임**: `onnxruntime-web` 1.22. `onnxruntime-web/webgpu` 진입점을 동적 import,
  `.wasm`/`.mjs` 는 `public/ort/` 에 자체 호스팅 (7.7 — COOP/COEP 하에서 CDN 차단 대비).
  `postinstall` 이 node_modules 에서 복사 + 모델 내려받기 (오프라인이어도 install 은 통과)
- **EP**: 현재는 멀티스레드 **WASM** 만. ORT 1.22 의 WebGPU EP 는 이 모델의 Clip 커널에서
  실패한다(실측 `[Clip] /Clip failed`). WebGPU 경로는 일정대로 **W5** 에서 붙인다
- `core/upscale.ts` — 7.6 지연 로딩 구조(libheif·VTracer)를 그대로 재사용. `loadUpscaler()`
  3회 재시도, `preloadUpscaler()`, `upscaleX4(rgba,w,h)` (RGBA8↔NCHW f32, 알파는 현재 무시 → 불투명)
- `core/pipeline.ts` — `mode: "upscale"` 분기: 디코딩 → (자르기·리사이즈) → 래스터화 →
  x4 추론 → 목표 배율로 축소 → 인코딩. `ConvertResult.upscaled`/`scale`
- `ConvertMode += "upscale"`, `ConvertSettings.upscale: { scale: 2|4 }`, `DEFAULT_UPSCALE`,
  `UPSCALE_MAX_INPUT_PX`(약 130만 — 타일 분할 전 임시 상한), 오류코드 3종, `messages.ts` 문구
- 워커 규약(`protocol`/`pool`/`convert.worker`)에 `upscaled`/`scale` 전달
- `/dev` 하니스에 업스케일 토글 + 배율 선택. `NEXT_PUBLIC_DEV_HARNESS=1` 이면 프로덕션 빌드에서도 `/dev` 열림
- **검증(프로덕션 빌드, 브라우저 WASM EP, 8코어 Mac)**:
  128×96 →x2→ 256×192 · 2.9초 · 형태/텍스트 선명 |
  600×450 →x4→ 2400×1800 · 18초 |
  1600×1000 입력 → `image-too-large` 로 차단 (이후 W3 타일 분할로 상한 상향)

### M3 (Phase 2 벡터화) W1~W3 완료

**W1 — VTracer 연동**
- `@visioncortex/vtracer`(공식, MIT/Apache) 벤더링 — nodejs 타깃이라 부트스트랩만 브라우저용으로
  교체 (`scripts/vendor-vtracer.mjs` → `src/vendor/vtracer/`, `public/wasm/vtracer.wasm`, `npm run vendor:vtracer`)
- `core/vectorize.ts` — VTracer WASM 지연 로딩(7.6 패턴), 3회 재시도, `preloadVtracer()`
- `core/pipeline.ts` — 벡터 분기: 디코딩 → 자르기 → 리사이즈 → 래스터화 → VTracer → SVG Blob.
  `ConvertSettings.mode: "raster" | "vector"` (7.10 "워커 메시지 규약에 mode 필드")
- 워커 통합: `protocol.ts`/`pool.ts`/`convert.worker.ts` 가 mode·vector·mime 전달. VTracer는 워커 안에서 인스턴스화

**W2 — 프리셋 · 파라미터 · 미리보기**
- `SettingsPanel` "변환 방식" 토글 + `VECTOR_PRESETS`(로고·아이콘 / 일러스트 / 선화(흑백) / 픽셀 아트)
  + 파라미터(색상 컬러/흑백, 선 표현 곡선/직선/픽셀, 잡티 제거, 색상 정밀도)
- `FileItem` — 벡터 결과는 실제 SVG를 썸네일로(체크무늬 배경), 파라미터 바꿔 다시 변환 가능
- `PrimaryAction` "SVG로 변환 (N장)"

**W3 — 적합성 판정 (8.5 핵심 난이도) + 랜딩**
- `core/suitability.ts` — 축소본(256px)에서 ① 색 버킷 수(4비트/채널) ② flat 비율(이웃 밝기차 ≤10)
  ③ edge 비율. `good`(색 ≤64, flat ≥0.5) / `fair` / `poor`(색 >2500 또는 flat <0.22)
- 분석 단계(`useFileStore.analyze`)에서 판정 → `FileItem` 인라인 표시 + `poor` 시 L2 배너
- `/png-to-svg` 랜딩 (본문·FAQ·FAQPage/SoftwareApplication JSON-LD), Header·OtherConversions·sitemap 등록

**W2/W3 이후 — 비교 뷰 · 추가 랜딩**
- `CompareDialog` (5.11 / 6.3 / 6.10 미결 2번) — 완료된 항목 클릭 → 원본·결과 나란히,
  **확대·이동 양쪽 동일 좌표 연동**(휠 1~8배, 드래그, 더블클릭 초기화), Esc. 벡터 결과는
  확대해도 깨지지 않는 것을 눈으로 확인 가능. `useFileStore.compareId`
- 랜딩 `/jpg-to-svg`(JPG 노이즈 주의), `/image-to-svg`(범용) 추가 — 본문·FAQ·JSON-LD,
  Header·OtherConversions·sitemap 등록 (SVG 랜딩 3개)

검증(브라우저): 로고 PNG 10KB → SVG 0.8KB(92% 감소) · 사진 JPG → SVG 1.8MB(사진 자동 감지 → 인라인 + L2 경고)
· 프리셋·파라미터 조정 후 S4 폐기 확인 → 재변환 · SVG 썸네일 미리보기 · **비교 뷰 확대 시 원본↔SVG 동기화**
· 랜딩 SSR/JSON-LD (png/jpg/image-to-svg)

**외부 참고 반영 (kwak_svg_converter.html 검토 후 A·B만 채택)**
- **A. 배경 제거** — `core/background.ts`(`removeConnectedBackground`, 다른 개발자 구현 로직 이식).
  테두리 최빈색에서 flood-fill 로 연결된 배경만 알파 0 → VTracer가 배경 패스를 안 만든다.
  파이프라인 벡터 분기 전처리 + UI "배경 제거" 체크박스 + 강도 슬라이더.
  검증: 흰 배경 로고 → 투명 배경 SVG (fill 3개→2개)
- **B. 색 수 제한** — `VectorSettings.maxColors` (VTracer 내장 옵션, 0=제한 없음).
  노이즈로 비슷한 색이 여러 개로 갈릴 때 상한. UI 슬라이더. node 실측 11색→2색, 1808B→1017B
- **C. 고정 팔레트** — `VectorSettings.palette: string[]` (VTracer 내장 옵션).
  `PalettePicker` 모달: 원본을 캔버스로 디코딩(HEIC 포함) → **스포이드 클릭으로 색 샘플링** +
  색상 선택기 직접 추가, 스와치 제거·비우기 (최대 12색). 지정 시 colorPrecision·maxColors 대체.
  검증: 원본에서 3색 뽑기 → 결과 SVG가 정확히 그 3색(`#135e52`·`#b23a2e`·`#e8b800`)만 사용,
  배경 제거 병행 시 2KB(75% 감소)
- 채택 안 함: 직접 구현 트레이싱 엔진(VTracer 재구현 위험), `optimize`(빌드에서 효과 없음),
  에디터·PDF/AI/EPS, CDN 의존성

**고급 파라미터 UI**
- `VectorSettings` 확장: `lengthThreshold`·`spliceThreshold`·`pathPrecision` 추가 (총 12개)
- `SettingsPanel` 벡터 컨트롤에 `<details>` "고급 설정" — 색 레이어 병합, 코너 감도(°),
  경로 잇기(px), 이음새 각도(°), 좌표 정밀도 슬라이더 (곡선/픽셀 모드에 따라 표시 항목 조정)
  + "고급 설정 기본값으로" 리셋. `VecSlider` 헬퍼
- S4에서 슬라이더 드래그 시 폐기 확인 모달 중복 방지 (이미 대기 중이면 skip)
- 검증: 좌표 정밀도 8→2 로 SVG 3KB→2KB

**미리캔버스 조각 수 안내 (참고: kwak "미캔 30개 맞추기")**
- 미리캔버스·망고보드 등은 SVG의 `<path>` 수가 ~30개 넘으면 업로드가 안 되거나 느려짐
- `ConvertResult.pathCount` — 파이프라인에서 SVG의 path 수를 세어 워커·store 통해 전달
- `FileItem` 벡터 완료 항목에 "· 조각 N개" 표시
- `ResultSummary` — 30개 초과 시 빨간 안내 박스:
  ① "조각 N개… 대부분 안티에일리어싱 때문에 생긴 자잘한 조각" ② **"자잘한 조각 정리해서 다시 변환 (색은 유지)"** 버튼
  ③ `<details>` "그래도 많으면 — 직접 조정" 5단계 (잡티 제거↑ → 색 레이어 병합↑ → 배경 제거 → 크기↓ → **마지막 수단** 색 수 제한을 결과 보며 조금씩)
- **`MIRICANVAS_VECTOR` = filterSpeckle 12 · layerDifference 32 · maxColors 0 (색 강제 축소 안 함)**
  → 조각 폭증의 원인은 노이즈지 색 수가 아니므로, 잡티·레이어 병합으로 노이즈만 걷어낸다
- `VECTOR_PRESETS`에 "미리캔버스" 프리셋 추가
- 검증: 노이즈 심한 5색 이미지 **645조각·141색 → 버튼 1회 → 9조각·9색**(실제 5색 + 블렌드 4색, 형태·색 온전).
  이전 `maxColors 4` 버전은 색이 뭉개져 인식 불가 → 폐기.
  곽 버전처럼 paper.js로 실제 path 병합하는 건 채택 안 함 — 파라미터 재변환이 단순·안전

**비교 뷰 발견성 개선**
- 완료 항목 클릭만으로는 비교 뷰를 모르고 지나침 → 세 가지 신호 추가:
  ① `ResultSummary` 강조 안내 박스 "⤢ 파일을 누르면 원본과 결과를 나란히 볼 수 있어요"
  ② 완료 항목 썸네일 우하단 상시 `⤢` 배지
  ③ 항목 액션에 명시적 "비교" 버튼 (⤢, ⤓ 옆). hover 시 항목 outline
- 검증: 버튼·썸네일·Enter 키 모두 비교 뷰 오픈, 다운로드 버튼은 오픈 안 함

**남은 것**
- 비교 뷰: 확대 시 커서 기준 줌(현재는 중심 기준), before/after 슬라이더 옵션
- 적합성 판정 임계값 실사용 데이터로 재조정 (M2)
- 프리셋 활성 표시가 고급 파라미터 변경을 반영하지 않음 (기본 4항목만 비교)

## Phase 1 상태 — M1 W4 (마감 · 기능 완성)

일정 문서 8.3 기준.

**W1 (기반) — 완료**
- Next.js(App Router) + TypeScript + CSS 토큰, 7.2 디렉터리 구조
- 파일 하나를 JPG로 바꿔 다운로드하는 최소 동작 (`/`)

**W2 (파이프라인) — 완료. `core/`가 5장 명세의 변환 기능을 모두 수행**
- `core/decode.ts` — 매직넘버 판별 + 디코딩. HEIC는 libheif WASM 지연 로딩(`.mjs` 동적 import, 3회 재시도). `preloadHeif()` 제공 — `/heic-to-jpg` 진입 시 호출은 W3에서 연결
- `core/resize.ts` — 단계적 축소(0.5배 미만이면 절반씩). 긴 변/너비/배율/원본 유지
- `core/encode.ts` — jpeg·webp(품질) / png·bmp(무손실). 알파 없는 포맷은 배경색 채움
- `core/targetSize.ts` — 목표 용량 이진 탐색 8회, 미달 시 `reached:false`
- `core/metadata.ts` — 회전은 디코딩 시 픽셀 반영(자동 제거). `stripMetadata:false`면 JPEG→JPEG 경로에서 원본 APP1 재삽입(Orientation=1로 정규화)
- `core/pipeline.ts` — 8단계 조립 (판별→추출→디코딩→회전→자르기→리사이즈→인코딩→메타데이터)
- 개발 점검용 `/dev` (프로덕션 빌드에서 404)

검증: format sniff·HEIC→JPEG·리사이즈(가로/세로)·jpeg/png/webp 인코딩·목표 용량(달성/미달)·strip 토글 전부 브라우저에서 확인.

**W3 (워커와 UI) — 완료. 목업(6장)과 동일하게 동작하는 실제 도구**
- `workers/pool.ts` — 워커 풀 (N=min(hc-1, 4)), 첫 변환 시 생성, 파일 단위 큐 배분, 취소(terminate), 워커 생성 실패 시 메인 스레드 폴백 (5.10 / 7.4)
- `workers/convert.worker.ts` + `protocol.ts` — 7.4 메시지 규약 (progress/done/error)
- `store/useFileStore.ts` — 상태 전이 S0~S5, 파일 분석·썸네일·결과 URL 수명 관리
- `store/useSettingsStore.ts` — 5.12 랜딩 초기값 + 5.13 localStorage (lastSettings는 `/`만 복원)
- 화면설계 6장: `FileZone`(드롭·붙여넣기·키보드), `FileList`/`FileItem`(5개 상태 한 컴포넌트), `ProgressFrame`(6.1.1 테두리=진행률 SVG, 처리 중 항목만, viewBox 실측 픽셀, pathLength 정규화), `SettingsPanel`(포맷·크기·품질/목표용량·메타데이터·자르기 비활성), `ResultSummary`, `PrivacyIndicator`(sticky, 검증법 패널), `Header`/`Footer`
- 데스크톱 2단(7:5) / 모바일 1단 + 하단 고정 시작 버튼 (6.2 / 6.4)
- 5.3.3 이탈 방지(beforeunload), S3 설정 잠금, S4 설정 변경 시 S2 복귀

**W4 (마감) — 완료. 기능 완성**
- **ZIP 다운로드** (`components/tool/download.ts`, fflate) — 2장 이상 ZIP + 개별 병기, 파일명 충돌 순번, `moltimage_YYYYMMDD_HHmm.zip` (5.11)
- **"원본 유지" 출력 포맷** (5.6) — 파일별 소스 포맷으로 확정. `/`·`/compress-image`·`/resize-image` 기본값
- **자르기** `CropDialog` (5.9 / 6.4) — 드래그 이동·모서리 조정·수치 입력·비율 프리셋·초기화, 원본 해상도 기준 저장, 10px 미만 차단, HEIC 포함 전체화면 모달
- **L2 배너** `NoticeBanner` (5.3.2) — 투명도 손실·확대·혼재·100장·50MB, 조치 버튼, `dismissedNotices`(sessionStorage)
- **L3 모달** `ModalQueue` (6.6) — 부분 실패(목록)·전체 실패·결과 폐기 확인·폴더 빈 경우, 순차 큐, 포커스 트랩, Esc, 배경 클릭 무시
- **폴더 드롭** 재귀 탐색 (5.4)
- **가상 스크롤** 20장 초과 시 창 렌더링 (5.5)
- **오류 처리** — 손상 파일 분석 단계에서 제외, 실패 항목 재시도(↻), 부분 실패 자동 L3
- **접근성** (6.8 / 6.9) — 탭 순서(설정 패널이 목록보다 DOM 앞, CSS order로 시각 배치), 전체 진행률 aria-live, 파일 투입 시 시작 버튼 포커스, 모달 포커스 트랩·복귀
- 모바일 설정 접힘 + 요약 표시 (6.4), 예상 해상도 표시 (5.5)

검증(프로덕션 빌드, 브라우저): W1~W3 흐름 전체 + L2 배너(표시·닫기·조치)·ZIP(항목 포맷 유지·파일명)·"원본 유지" 파일별 포맷·자르기(적용→800×600 결과)·부분 실패 L3(목록·포커스 트랩)·S4 설정 변경 폐기 확인(계속/취소)·업스케일 예상 해상도·모바일 설정 접힘.

## 남은 것 — M1 W5 (배포)

- 랜딩 페이지 5개 본문·FAQ 작성 (`content/conversions/`, 각 400자 이상)
- SEO: FAQPage / SoftwareApplication JSON-LD (7.8)
- Pretendard 서브셋 자체 호스팅, `font-display: swap` (7.7)
- `.wasm` 분리 배포 — 콘텐츠 해시 + LGPL 교체 가능성 (7.7 / 7.12). 현재 `libheif-bundle.mjs` 인라인
- 실기기 확인 (iOS Safari 주소창 dvh, 저사양 PC), 도메인 연결

### 이월된 세부 항목
- 워커별 WASM Module 컴파일·전달 (7.6) — 현재는 워커마다 지연 import
- 캔버스 워커당 재사용 (7.5) — 현재는 단계마다 새로 생성
- 실기기 세로 HEIC(EXIF Orientation) 회전 검증
- 애니메이션 GIF/WebP 프레임 수 실검사 (현재 `animated` 플래그 미설정)
- PNG/WebP 소스 메타데이터 유지, ICC 프로파일 명시적 이식
- 결과 비교 뷰 (원본·결과 나란히, 6.10 미결 2번)
- 개발 점검용 `/dev` 제거

## 개발

```bash
npm install
npm run dev
```

`npm run typecheck` 로 타입 확인.
