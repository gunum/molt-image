"use client";

/*
 * S4 결과 요약 (6.3 / 5.11).
 *
 * - 도구 영역 최상단, 두 단에 걸침. L1 인라인 — 자동으로 사라지지 않는다.
 * - 용량 감소율이 가장 큰 글자다 (6.3).
 * - 메타데이터 제거 사실을 요약 안에 명시한다 (5.11).
 * - 1장 → 개별 다운로드 / 2장 이상 → ZIP + 개별 병기 (5.11).
 * - 벡터 결과 조각(path) 수가 많으면 미리캔버스 업로드 안내 (참고: kwak 버전 "미캔 30개 맞추기").
 * - 부분 실패는 L3 모달이 별도로 강제 확인시킨다 (useFileStore.maybePartialFailModal).
 */

import { useMemo, useState } from "react";
import {
  DEFAULT_VECTOR,
  MIRICANVAS_PATH_LIMIT,
  MIRICANVAS_VECTOR,
} from "@/core/types";
import { useFileStore } from "@/store/useFileStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { downloadItem, downloadZip } from "./download";
import { formatBytes, reductionText } from "./format";
import styles from "./ResultSummary.module.css";

export default function ResultSummary() {
  const items = useFileStore((s) => s.items);
  const stripMetadata = useSettingsStore((s) => s.settings.stripMetadata);
  const [zipping, setZipping] = useState(false);

  const { done, failed, fromTotal, toTotal, missed, anyVector, maxPaths } =
    useMemo(() => {
      const d = items.filter((it) => it.status === "done" && it.result);
      return {
        done: d,
        failed: items.filter((it) => it.status === "failed").length,
        fromTotal: d.reduce((s, it) => s + it.originalSize, 0),
        toTotal: d.reduce((s, it) => s + (it.result?.blob.size ?? 0), 0),
        missed: d.some((it) => it.result?.targetSize?.reached === false),
        anyVector: d.some((it) => it.result?.vector),
        maxPaths: d.reduce(
          (m, it) => Math.max(m, it.result?.pathCount ?? 0),
          0,
        ),
      };
    }, [items]);

  const overLimit = anyVector && maxPaths > MIRICANVAS_PATH_LIMIT;

  const applyMiricanvas = () => {
    const s = useSettingsStore.getState();
    s.patch({
      vector: { ...(s.settings.vector ?? DEFAULT_VECTOR), ...MIRICANVAS_VECTOR },
    });
    useFileStore.getState().backToReady();
    useFileStore.getState().start();
  };

  if (done.length === 0 && failed === 0) return null;

  return (
    <section className={styles.summary} aria-live="polite">
      <p className={styles.headline}>
        <span className={styles.check} aria-hidden>
          ✓
        </span>{" "}
        {done.length}장 변환 완료
        {failed > 0 && <span className={styles.failed}> · {failed}장 실패</span>}
      </p>

      {done.length > 0 && (
        <p className={`${styles.stat} tabular`}>
          {formatBytes(fromTotal)} → <strong>{formatBytes(toTotal)}</strong>
          <span className={styles.reduction}>
            {" "}
            {reductionText(fromTotal, toTotal)}
          </span>
        </p>
      )}

      {done.length > 0 && (
        <div className={styles.actions}>
          {done.length === 1 ? (
            <button
              type="button"
              className={styles.primary}
              onClick={() => downloadItem(done[0])}
            >
              내려받기
            </button>
          ) : (
            <button
              type="button"
              className={styles.primary}
              disabled={zipping}
              onClick={async () => {
                setZipping(true);
                try {
                  await downloadZip(items);
                } finally {
                  setZipping(false);
                }
              }}
            >
              {zipping ? "압축 중…" : `ZIP으로 받기 (${done.length}장)`}
            </button>
          )}
        </div>
      )}

      {overLimit && (
        <div className={styles.warnBox}>
          <p className={styles.warnTitle}>
            조각(path)이 {maxPaths}개입니다 — 미리캔버스·망고보드 같은 툴은 30개를
            넘으면 업로드가 안 되거나 느려질 수 있어요. 대부분은 안티에일리어싱
            때문에 생긴 <b>자잘한 조각</b>이라, 노이즈만 걷어내면 크게 줄어듭니다.
          </p>
          <button
            type="button"
            className={styles.warnAction}
            onClick={applyMiricanvas}
          >
            미리캔버스용으로 조각 줄이기 (색은 유지)
          </button>
          <details className={styles.warnHow}>
            <summary>그래도 많으면 — 직접 조정</summary>
            <ol>
              <li>
                <b>잡티 제거</b>를 <b>8~12</b>로 올립니다 (노이즈로 생긴 작은
                조각을 흡수 — 색은 유지되고 조각 수에 가장 큰 영향).
              </li>
              <li>
                고급 설정에서 <b>색 레이어 병합</b>을 <b>28 이상</b>으로 올려
                거의 같은 색을 합칩니다.
              </li>
              <li>
                흰·단색 배경이면 <b>배경 제거</b>를 켜 배경 조각을 없앱니다.
              </li>
              <li>
                <b>크기</b>를 긴 변 <b>1200~1600px</b>로 줄입니다 (픽셀이 줄면
                구역도 줄어듭니다).
              </li>
              <li>
                마지막 수단으로 <b>색 수 제한</b>을 <b>결과를 보며</b> 10색부터
                조금씩 낮춥니다. 너무 낮추면 이미지가 뭉개지니 주의하세요.
              </li>
            </ol>
            <p>
              값을 바꾸면 &quot;설정을 바꾸면 다시 변환합니다&quot; 확인 후
              재변환됩니다.
            </p>
          </details>
        </div>
      )}

      {done.length > 0 && (
        <p className={styles.tip}>
          <span aria-hidden>⤢</span> 아래 목록에서 파일을 누르면 원본과 결과를
          나란히 볼 수 있어요
        </p>
      )}
      {stripMetadata && done.length > 0 && !anyVector && (
        <p className={styles.note}>위치 정보 등 메타데이터가 제거되었습니다</p>
      )}
      {anyVector && !overLimit && (
        <p className={styles.note}>
          결과가 마음에 들지 않으면 색상·잡티 제거 값을 조정해 다시 변환하세요.
        </p>
      )}
      {missed && (
        <p className={styles.note}>
          일부 파일은 목표 용량 이하로 줄이지 못했습니다. 크기를 함께 줄이면
          가능합니다.
        </p>
      )}
    </section>
  );
}
