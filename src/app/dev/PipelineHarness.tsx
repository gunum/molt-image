"use client";

import { useCallback, useRef, useState } from "react";
import { runPipeline } from "@/core/pipeline";
import {
  DEFAULT_VECTOR,
  type ConvertSettings,
  type OutputFormat,
  type ResizeMode,
} from "@/core/types";

const FORMATS: OutputFormat[] = ["jpeg", "png", "webp", "bmp"];
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

export default function PipelineHarness() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [output, setOutput] = useState<OutputFormat>("jpeg");
  const [quality, setQuality] = useState(85);
  const [longEdge, setLongEdge] = useState(0);
  const [targetKB, setTargetKB] = useState(0);
  const [strip, setStrip] = useState(true);
  const [vector, setVector] = useState(false);
  const [vcurve, setVcurve] = useState<"spline" | "polygon" | "pixel">("spline");
  const [vclustering, setVclustering] = useState<"color" | "bw">("color");
  const [vspeckle, setVspeckle] = useState(4);
  const [upscale, setUpscale] = useState(false);
  const [uscale, setUscale] = useState<2 | 4>(2);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const run = useCallback(
    async (file: File) => {
      const resize: ResizeMode =
        longEdge > 0 ? { kind: "longEdge", px: longEdge } : { kind: "keep" };
      const settings: ConvertSettings = {
        mode: upscale ? "upscale" : vector ? "vector" : "raster",
        output,
        resize,
        quality:
          targetKB > 0
            ? { kind: "targetSize", bytes: targetKB * 1024 }
            : { kind: "quality", value: quality },
        stripMetadata: strip,
        vector: {
          ...DEFAULT_VECTOR,
          curve: vcurve,
          clustering: vclustering,
          filterSpeckle: vspeckle,
        },
        upscale: { scale: uscale },
      };
      const t0 = performance.now();
      try {
        const r = await runPipeline(file, settings, {
          onProgress: (ratio) => setProgress(Math.round(ratio * 100)),
        });
        setProgress(null);
        const ms = Math.round(performance.now() - t0);
        const url = URL.createObjectURL(r.blob);
        if (r.vector || r.upscaled) setPreview(url);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${file.name.replace(/\.[^.]+$/, "")}.${EXT[r.mime] ?? "bin"}`;
        a.click();
        if (!r.vector && !r.upscaled) setTimeout(() => URL.revokeObjectURL(url), 0);
        setLog((l) => [
          `OK ${file.name} → ${r.mime} ${r.width}×${r.height} · ` +
            `${(file.size / 1024).toFixed(0)}KB → ${(r.blob.size / 1024).toFixed(0)}KB · ` +
            `${r.upscaled ? `upscale x${r.scale} (타일 ${r.tiles}${r.keptAlpha ? ", 알파 유지" : ""})` : r.vector ? "vector" : `q=${r.quality ?? "-"}`}${r.targetSize ? ` target ${r.targetSize.reached ? "met" : "MISSED"}` : ""} · ${ms}ms`,
          ...l,
        ]);
      } catch (err) {
        setProgress(null);
        setLog((l) => [
          `ERR ${file.name}: ${err instanceof Error ? `${err.name}/${err.message}` : String(err)}`,
          ...l,
        ]);
      }
    },
    [
      output,
      quality,
      longEdge,
      targetKB,
      strip,
      vector,
      vcurve,
      vclustering,
      vspeckle,
      upscale,
      uscale,
    ],
  );

  return (
    <main style={{ padding: 24, fontFamily: "var(--font-sans)", maxWidth: 720 }}>
      <h1 style={{ fontSize: 20 }}>core/ pipeline harness — dev only</h1>

      <div style={{ display: "grid", gap: 8, margin: "16px 0" }}>
        <label>
          <input
            type="checkbox"
            checked={vector}
            onChange={(e) => {
              setVector(e.target.checked);
              if (e.target.checked) setUpscale(false);
            }}
          />{" "}
          <strong>벡터화(SVG) — VTracer</strong>
        </label>

        <label>
          <input
            type="checkbox"
            checked={upscale}
            onChange={(e) => {
              setUpscale(e.target.checked);
              if (e.target.checked) setVector(false);
            }}
          />{" "}
          <strong>업스케일 — ONNX Real-ESRGAN</strong>
        </label>

        {upscale && (
          <label>
            배율:{" "}
            <select
              value={uscale}
              onChange={(e) => setUscale(+e.target.value as 2 | 4)}
            >
              <option value={2}>x2</option>
              <option value={4}>x4</option>
            </select>
          </label>
        )}

        {vector ? (
          <>
            <label>
              곡선:{" "}
              <select
                value={vcurve}
                onChange={(e) =>
                  setVcurve(e.target.value as "spline" | "polygon" | "pixel")
                }
              >
                <option value="spline">spline</option>
                <option value="polygon">polygon</option>
                <option value="pixel">pixel</option>
              </select>
            </label>
            <label>
              군집:{" "}
              <select
                value={vclustering}
                onChange={(e) =>
                  setVclustering(e.target.value as "color" | "bw")
                }
              >
                <option value="color">color</option>
                <option value="bw">bw</option>
              </select>
            </label>
            <label>
              잡티 제거: {vspeckle}{" "}
              <input
                type="range"
                min={0}
                max={20}
                value={vspeckle}
                onChange={(e) => setVspeckle(+e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              출력:{" "}
              <select
                value={output}
                onChange={(e) => setOutput(e.target.value as OutputFormat)}
              >
                {FORMATS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              품질: {quality}{" "}
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(+e.target.value)}
              />
            </label>
            <label>
              목표 용량(KB, 0=끄기):{" "}
              <input
                type="number"
                value={targetKB}
                onChange={(e) => setTargetKB(+e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={strip}
                onChange={(e) => setStrip(e.target.checked)}
              />{" "}
              메타데이터 제거
            </label>
          </>
        )}

        <label>
          긴 변(px, 0=원본):{" "}
          <input
            type="number"
            value={longEdge}
            onChange={(e) => setLongEdge(+e.target.value)}
          />
        </label>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          files.forEach((f) => void run(f));
        }}
      />

      {progress != null && (
        <p style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>
          진행률 {progress}%
        </p>
      )}

      {preview && (
        <img
          src={preview}
          alt="결과"
          style={{
            marginTop: 16,
            maxWidth: "100%",
            border: "1px solid #ccc",
            background:
              "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 20px 20px",
          }}
        />
      )}

      <pre
        style={{
          marginTop: 16,
          padding: 12,
          background: "#fff",
          border: "1px solid #ccc",
          borderRadius: 6,
          whiteSpace: "pre-wrap",
          fontSize: 12,
        }}
      >
        {log.join("\n") || "(결과 없음)"}
      </pre>
    </main>
  );
}
