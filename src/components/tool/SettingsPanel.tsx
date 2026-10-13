"use client";

/*
 * 설정 패널 (6.7 / 6.3 / 5.6~5.9).
 *
 * - 데스크톱 sticky, 시작 버튼이 첫 요소 (6.3). 모바일은 하단 고정 바가 대신함.
 * - S3(처리 중)에는 설정을 잠근다 (5.2 / 6.3 — 흐림 처리).
 * - PNG·BMP 선택 시 품질 UI 비활성화, 목표 용량 모드 잠금 (5.8 / 7.3).
 * - S4에서 설정을 바꾸면 "변환 결과가 사라집니다" L3 확인 후 S2로 (5.2 / 5.3.2).
 * - 자르기는 단일 파일에서만 (5.9). CropDialog로 열린다.
 *
 * 6.7의 하위 컴포넌트(FormatSelect·QualityControl 등)는 이 파일에 인라인한다.
 */

import { useMemo, useState } from "react";
import {
  DEFAULT_VECTOR,
  OUTPUT_EXT,
  VECTOR_PRESETS,
  usesQuality,
  type ConvertMode,
  type ConvertSettings,
  type OutputFormat,
  type VectorSettings,
} from "@/core/types";
import { useFileStore } from "@/store/useFileStore";
import { useNoticeStore } from "@/store/useNoticeStore";
import {
  RESIZE_PRESETS,
  TARGET_PRESETS,
  useSettingsStore,
} from "@/store/useSettingsStore";
import CropDialog from "./CropDialog";
import PalettePicker from "./PalettePicker";
import { formatBytes } from "./format";
import PrimaryAction from "./PrimaryAction";
import styles from "./SettingsPanel.module.css";

const FORMATS: OutputFormat[] = ["jpeg", "png", "webp", "bmp"];

export default function SettingsPanel() {
  const app = useFileStore((s) => s.app);
  const items = useFileStore((s) => s.items);
  const backToReady = useFileStore((s) => s.backToReady);
  const pushModal = useNoticeStore((s) => s.pushModal);

  const settings = useSettingsStore((s) => s.settings);
  const keepFormat = useSettingsStore((s) => s.keepFormat);
  const locked = useSettingsStore((s) => s.locked);
  const rawPatch = useSettingsStore((s) => s.patch);
  const setKeepFormat = useSettingsStore((s) => s.setKeepFormat);

  const [cropOpen, setCropOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const disabled = locked || app === "S3";

  // S4에서 설정을 바꾸면 결과 폐기 확인 (5.2 / 5.3.2 L3).
  // 한 번의 상호작용 = 한 번의 확인. 여러 patch를 묶어 apply()에 넘긴다.
  const apply = (run: () => void) => {
    if (app !== "S4") {
      run();
      return;
    }
    // 슬라이더를 끌면 onChange가 연속으로 나온다 — 확인 모달이 이미 대기 중이면 중복 방지
    if (
      useNoticeStore
        .getState()
        .modals.some((m) => m.title === "변환 결과가 사라집니다")
    ) {
      return;
    }
    pushModal(
      {
        title: "변환 결과가 사라집니다",
        body: "설정을 바꾸면 다시 변환해야 합니다.",
        actions: [
          { label: "계속", value: "go", primary: true },
          { label: "취소", value: "cancel" },
        ],
      },
      (v) => {
        if (v === "go") {
          run();
          backToReady();
        }
      },
    );
  };

  const patch = (p: Partial<ConvertSettings>) => apply(() => rawPatch(p));

  const changeFormat = (v: string) =>
    apply(() => {
      if (v === "keep") {
        setKeepFormat(true);
      } else {
        setKeepFormat(false);
        rawPatch({ output: v as OutputFormat });
      }
    });

  const changeMode = (m: ConvertMode) =>
    apply(() => rawPatch({ mode: m, vector: settings.vector ?? DEFAULT_VECTOR }));
  const vec = settings.vector ?? DEFAULT_VECTOR;
  const patchVector = (p: Partial<VectorSettings>) =>
    apply(() => rawPatch({ vector: { ...vec, ...p } }));

  const isVector = settings.mode === "vector";

  const convertibleItems = useMemo(
    () => items.filter((it) => it.status !== "excluded"),
    [items],
  );
  const count = convertibleItems.length;
  const singleFile = count === 1;
  const qualityEnabled = keepFormat || usesQuality(settings.output);

  const formatValue = keepFormat ? "keep" : settings.output;

  // 모바일: 설정은 기본 접힘. 헤더에 현재 값 요약을 표시한다 (6.4)
  const [open, setOpen] = useState(false);
  const summary = settingsSummary(
    keepFormat ? "원본 유지" : OUTPUT_EXT[settings.output].toUpperCase(),
    settings,
  );

  return (
    <aside className={`${styles.panel} ${disabled ? styles.locked : ""}`}>
      <div className={styles.actionSlot}>
        <PrimaryAction autoFocus />
      </div>

      {app === "S3" && (
        <p className={styles.lockNote}>설정은 변환 중 변경할 수 없습니다</p>
      )}

      <button
        type="button"
        className={styles.mobileToggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>설정 ({summary})</span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>

      <fieldset
        className={`${styles.group} ${open ? styles.groupOpen : ""}`}
        disabled={disabled}
      >
        <div className={styles.label}>
          변환 방식
          <div className={styles.segmented}>
            <button
              type="button"
              aria-pressed={!isVector}
              className={!isVector ? styles.segOn : styles.seg}
              onClick={() => changeMode("raster")}
            >
              이미지
            </button>
            <button
              type="button"
              aria-pressed={isVector}
              className={isVector ? styles.segOn : styles.seg}
              onClick={() => changeMode("vector")}
            >
              벡터 (SVG)
            </button>
          </div>
        </div>

        {!isVector && (
          <label className={styles.label}>
            출력 형식
            <select
              value={formatValue}
              onChange={(e) => changeFormat(e.target.value)}
            >
              <option value="keep">원본 유지</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {OUTPUT_EXT[f].toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        )}

        {isVector && (
          <VectorControls
            vec={vec}
            onChange={patchVector}
            onOpenPalette={
              convertibleItems.length > 0
                ? () => setPaletteOpen(true)
                : undefined
            }
          />
        )}

        <label className={styles.label}>
          크기
          <select
            value={settings.resize.kind}
            onChange={(e) => {
              const kind = e.target.value;
              if (kind === "keep") patch({ resize: { kind: "keep" } });
              else if (kind === "longEdge")
                patch({ resize: { kind: "longEdge", px: 1920 } });
              else if (kind === "width")
                patch({ resize: { kind: "width", px: 1920 } });
              else patch({ resize: { kind: "scale", ratio: 0.5 } });
            }}
          >
            <option value="keep">원본 유지</option>
            <option value="longEdge">긴 변 기준</option>
            <option value="width">너비 지정</option>
            <option value="scale">비율</option>
          </select>
        </label>

        {(settings.resize.kind === "longEdge" ||
          settings.resize.kind === "width") && (
          <div className={styles.sub}>
            <input
              type="number"
              min={1}
              value={settings.resize.px}
              onChange={(e) =>
                patch({
                  resize: {
                    kind: settings.resize.kind as "longEdge" | "width",
                    px: Math.max(1, +e.target.value),
                  },
                })
              }
            />
            <span className={styles.unit}>px</span>
            {settings.resize.kind === "longEdge" && (
              <div className={styles.presets}>
                {RESIZE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => patch({ resize: { kind: "longEdge", px: p } })}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {settings.resize.kind === "scale" && (
          <div className={styles.sub}>
            <input
              type="number"
              min={1}
              max={400}
              value={Math.round(settings.resize.ratio * 100)}
              onChange={(e) =>
                patch({
                  resize: {
                    kind: "scale",
                    ratio: Math.max(0.01, +e.target.value / 100),
                  },
                })
              }
            />
            <span className={styles.unit}>%</span>
          </div>
        )}

        {!isVector && (
        <>
        <div className={styles.label}>
          <span>품질 · 용량</span>
          <div className={styles.modes}>
            <label>
              <input
                type="radio"
                name="qmode"
                checked={settings.quality.kind === "quality"}
                disabled={!qualityEnabled}
                onChange={() => patch({ quality: { kind: "quality", value: 85 } })}
              />
              품질 지정
            </label>
            <label>
              <input
                type="radio"
                name="qmode"
                checked={settings.quality.kind === "targetSize"}
                disabled={!qualityEnabled}
                onChange={() =>
                  patch({ quality: { kind: "targetSize", bytes: 1024 * 1024 } })
                }
              />
              목표 용량
            </label>
          </div>
        </div>

        {!qualityEnabled && (
          <p className={styles.hint}>
            {OUTPUT_EXT[settings.output].toUpperCase()}는 무손실이라 품질 설정이
            없습니다
          </p>
        )}
        {keepFormat && qualityEnabled && (
          <p className={styles.hint}>PNG 결과에는 품질이 적용되지 않습니다</p>
        )}

        {qualityEnabled && settings.quality.kind === "quality" && (
          <div className={styles.sub}>
            <input
              type="range"
              min={1}
              max={100}
              value={settings.quality.value}
              onChange={(e) =>
                patch({ quality: { kind: "quality", value: +e.target.value } })
              }
            />
            <span className={`${styles.unit} tabular`}>
              {settings.quality.value}
            </span>
          </div>
        )}

        {qualityEnabled && settings.quality.kind === "targetSize" && (
          <div className={styles.sub}>
            <input
              type="number"
              min={1}
              value={Math.round(settings.quality.bytes / 1024)}
              onChange={(e) =>
                patch({
                  quality: {
                    kind: "targetSize",
                    bytes: Math.max(1, +e.target.value) * 1024,
                  },
                })
              }
            />
            <span className={styles.unit}>KB</span>
            <div className={styles.presets}>
              {TARGET_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    patch({ quality: { kind: "targetSize", bytes: p } })
                  }
                >
                  {formatBytes(p)}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={settings.stripMetadata}
            onChange={(e) => patch({ stripMetadata: e.target.checked })}
          />
          위치 정보 등 메타데이터 제거 <span className={styles.rec}>(권장)</span>
        </label>
        </>
        )}

        <div className={styles.crop}>
          <span>자르기</span>
          {singleFile ? (
            settings.crop ? (
              <div className={styles.cropActive}>
                <span className="tabular">
                  {settings.crop.width}×{settings.crop.height}
                </span>
                <button type="button" onClick={() => setCropOpen(true)}>
                  조정
                </button>
                <button
                  type="button"
                  onClick={() => patch({ crop: undefined })}
                >
                  해제
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.cropOpen}
                onClick={() => setCropOpen(true)}
              >
                영역 지정
              </button>
            )
          ) : (
            <p className={styles.hint}>
              파일이 여러 장이라 사용할 수 없습니다
            </p>
          )}
        </div>
      </fieldset>

      {app === "S4" && (
        <p className={styles.hint}>설정을 바꾸면 다시 변환합니다</p>
      )}

      {cropOpen && singleFile && (
        <CropDialog
          file={convertibleItems[0].file}
          source={convertibleItems[0].source}
          initial={settings.crop}
          onApply={(rect) => {
            setCropOpen(false);
            patch({ crop: rect });
          }}
          onCancel={() => setCropOpen(false)}
        />
      )}

      {paletteOpen && convertibleItems[0] && (
        <PalettePicker
          file={convertibleItems[0].file}
          source={convertibleItems[0].source}
          palette={vec.palette}
          onChange={(p) => patchVector({ palette: p })}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </aside>
  );
}

function settingsSummary(formatLabel: string, s: ConvertSettings): string {
  const vector = s.mode === "vector";
  const parts = [vector ? "벡터 SVG" : formatLabel];
  if (s.resize.kind === "longEdge") parts.push(`긴 변 ${s.resize.px}`);
  else if (s.resize.kind === "width") parts.push(`너비 ${s.resize.px}`);
  else if (s.resize.kind === "scale")
    parts.push(`${Math.round(s.resize.ratio * 100)}%`);
  if (!vector) {
    if (s.quality.kind === "quality") parts.push(`품질 ${s.quality.value}`);
    else parts.push(`목표 ${Math.round(s.quality.bytes / 1024)}KB`);
  }
  return parts.join(" · ");
}

const CURVES: { v: VectorSettings["curve"]; label: string }[] = [
  { v: "spline", label: "곡선" },
  { v: "polygon", label: "직선" },
  { v: "pixel", label: "픽셀" },
];

function VecSlider({
  label,
  hint,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className={styles.label}>
      <span>
        {label} <span className={`${styles.unit} tabular`}>{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
      <span className={styles.hint}>{hint}</span>
    </label>
  );
}

function VectorControls({
  vec,
  onChange,
  onOpenPalette,
}: {
  vec: VectorSettings;
  onChange: (p: Partial<VectorSettings>) => void;
  onOpenPalette?: () => void;
}) {
  const fixedPalette = vec.palette.length > 0;
  const activePreset = VECTOR_PRESETS.find(
    (p) =>
      p.settings.clustering === vec.clustering &&
      p.settings.curve === vec.curve &&
      p.settings.filterSpeckle === vec.filterSpeckle &&
      p.settings.colorPrecision === vec.colorPrecision,
  );

  return (
    <div className={styles.vec}>
      <div className={styles.label}>
        프리셋
        <div className={styles.presets}>
          {VECTOR_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={activePreset?.id === p.id ? styles.presetOn : undefined}
              onClick={() => onChange(p.settings)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.label}>
        색상
        <div className={styles.modes}>
          <label>
            <input
              type="radio"
              name="vclust"
              checked={vec.clustering === "color"}
              onChange={() => onChange({ clustering: "color" })}
            />
            컬러
          </label>
          <label>
            <input
              type="radio"
              name="vclust"
              checked={vec.clustering === "bw"}
              onChange={() => onChange({ clustering: "bw" })}
            />
            흑백
          </label>
        </div>
      </div>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={vec.removeBackground}
          onChange={(e) => onChange({ removeBackground: e.target.checked })}
        />
        배경 제거 <span className={styles.rec}>(테두리에서 연결된 배경만)</span>
      </label>
      {vec.removeBackground && (
        <VecSlider
          label="배경 제거 강도"
          hint="배경색과 비슷한 정도를 얼마나 넓게 볼지"
          min={8}
          max={80}
          value={vec.bgTolerance}
          onChange={(n) => onChange({ bgTolerance: n })}
        />
      )}

      <div className={styles.label}>
        선 표현
        <div className={styles.presets}>
          {CURVES.map((c) => (
            <button
              key={c.v}
              type="button"
              className={vec.curve === c.v ? styles.presetOn : undefined}
              onClick={() => onChange({ curve: c.v })}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <label className={styles.label}>
        잡티 제거 <span className={`${styles.unit} tabular`}>{vec.filterSpeckle}</span>
        <input
          type="range"
          min={0}
          max={16}
          value={vec.filterSpeckle}
          onChange={(e) => onChange({ filterSpeckle: +e.target.value })}
        />
      </label>

      {vec.clustering === "color" && (
        <div className={styles.label}>
          팔레트
          {fixedPalette ? (
            <>
              <div className={styles.swatchRow}>
                {vec.palette.map((c) => (
                  <span
                    key={c}
                    className={styles.swatchMini}
                    style={{ background: c }}
                    title={c}
                  />
                ))}
              </div>
              <div className={styles.presets}>
                <button type="button" onClick={onOpenPalette}>
                  색 수정
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ palette: [] })}
                >
                  자동으로
                </button>
              </div>
              {!vec.removeBackground && (
                <span className={styles.hint}>
                  배경이 팔레트 색으로 칠해지면 &apos;배경 제거&apos;도 켜세요
                </span>
              )}
            </>
          ) : (
            <button
              type="button"
              className={styles.cropOpen}
              disabled={!onOpenPalette}
              onClick={onOpenPalette}
            >
              색 직접 지정
            </button>
          )}
        </div>
      )}

      {vec.clustering === "color" && !fixedPalette && (
        <label className={styles.label}>
          색상 정밀도{" "}
          <span className={`${styles.unit} tabular`}>{vec.colorPrecision}</span>
          <input
            type="range"
            min={1}
            max={8}
            value={vec.colorPrecision}
            onChange={(e) => onChange({ colorPrecision: +e.target.value })}
          />
        </label>
      )}

      {vec.clustering === "color" && !fixedPalette && (
        <label className={styles.label}>
          색 수 제한{" "}
          <span className={`${styles.unit} tabular`}>
            {vec.maxColors === 0 ? "제한 없음" : `${vec.maxColors}색`}
          </span>
          <input
            type="range"
            min={0}
            max={16}
            value={vec.maxColors}
            onChange={(e) => onChange({ maxColors: +e.target.value })}
          />
          <span className={styles.hint}>
            비슷한 색이 여러 개로 갈릴 때 상한을 두면 파일이 작아진다
          </span>
        </label>
      )}

      <details className={styles.advanced}>
        <summary>고급 설정</summary>

        {vec.clustering === "color" && (
          <VecSlider
            label="색 레이어 병합"
            hint="높일수록 레이어·파일이 준다"
            min={0}
            max={64}
            value={vec.layerDifference}
            onChange={(n) => onChange({ layerDifference: n })}
          />
        )}
        {vec.curve !== "pixel" && (
          <VecSlider
            label="코너 감도(°)"
            hint="낮추면 각이 살고, 높이면 부드러워진다"
            min={0}
            max={180}
            value={vec.cornerThreshold}
            onChange={(n) => onChange({ cornerThreshold: n })}
          />
        )}
        {vec.curve !== "pixel" && (
          <VecSlider
            label="경로 잇기(px)"
            hint="짧은 조각을 잇는 기준 길이"
            min={0}
            max={10}
            value={vec.lengthThreshold}
            onChange={(n) => onChange({ lengthThreshold: n })}
          />
        )}
        {vec.curve === "spline" && (
          <VecSlider
            label="이음새 각도(°)"
            hint="곡선 조각을 잇는 최대 각"
            min={0}
            max={90}
            value={vec.spliceThreshold}
            onChange={(n) => onChange({ spliceThreshold: n })}
          />
        )}
        <VecSlider
          label="좌표 정밀도"
          hint="낮추면 파일이 작아진다"
          min={1}
          max={8}
          value={vec.pathPrecision}
          onChange={(n) => onChange({ pathPrecision: n })}
        />

        <button
          type="button"
          className={styles.vecReset}
          onClick={() =>
            onChange({
              layerDifference: DEFAULT_VECTOR.layerDifference,
              cornerThreshold: DEFAULT_VECTOR.cornerThreshold,
              lengthThreshold: DEFAULT_VECTOR.lengthThreshold,
              spliceThreshold: DEFAULT_VECTOR.spliceThreshold,
              pathPrecision: DEFAULT_VECTOR.pathPrecision,
            })
          }
        >
          고급 설정 기본값으로
        </button>
      </details>

      <p className={styles.hint}>
        사진보다 로고·아이콘·단순한 그림에 적합합니다.
      </p>
    </div>
  );
}
