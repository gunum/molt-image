"use client";

/*
 * (C) 도구 영역 — 6.7 컴포넌트 계층의 루트. 상태(5.2)에 따라 화면을 전환한다.
 *
 *   S0 대기   → FileZone
 *   S1 분석중 → 스켈레톤
 *   S2 준비   ┐
 *   S3 처리중 ├ 설정 패널 + 파일 목록 (+ S4는 결과 요약, L2 배너)
 *   S4 완료   ┘
 *   S5 오류   → 안내 + 초기화
 *
 * 탭 순서 (6.8): 시작 버튼(설정 패널 안) → 설정 → 파일 추가/삭제 → 파일 항목.
 *   따라서 DOM 순서도 설정 패널이 목록보다 앞. 데스크톱 2단 배치는 CSS order로 뒤집는다.
 * 진행 상황은 전체 진행률만 aria-live로 알린다 (6.9).
 * 이탈 방지 (5.3.3): S3·S4에서 페이지를 닫으려 하면 브라우저 확인창.
 */

import { useEffect, useMemo, useRef } from "react";
import { preloadHeif } from "@/core/decode";
import { preloadVtracer } from "@/core/vectorize";
import type { ConvertSettings } from "@/core/types";
import { useFileStore } from "@/store/useFileStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import NoticeBanner from "@/components/common/NoticeBanner";
import CompareDialog from "./CompareDialog";
import FileList from "./FileList";
import FileZone from "./FileZone";
import PrimaryAction from "./PrimaryAction";
import ResultSummary from "./ResultSummary";
import SettingsPanel from "./SettingsPanel";
import styles from "./ToolArea.module.css";

export default function ToolArea({
  initialSettings,
  restoreLast = false,
  keepFormat = false,
  preloadHeic = false,
  preloadVector = false,
}: {
  initialSettings: ConvertSettings;
  restoreLast?: boolean;
  keepFormat?: boolean;
  preloadHeic?: boolean;
  preloadVector?: boolean;
}) {
  const app = useFileStore((s) => s.app);
  const items = useFileStore((s) => s.items);
  const fallbackMode = useFileStore((s) => s.fallbackMode);
  const clearAll = useFileStore((s) => s.clearAll);
  const addFiles = useFileStore((s) => s.addFiles);
  const compareId = useFileStore((s) => s.compareId);
  const compareItem = compareId
    ? items.find((it) => it.id === compareId) ?? null
    : null;
  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    useSettingsStore.getState().hydrate(
      { settings: initialSettings, keepFormat },
      restoreLast,
    );
    if (preloadHeic) preloadHeif();
    if (preloadVector) preloadVtracer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 5.3.3 이탈 방지
  useEffect(() => {
    if (app !== "S3" && app !== "S4") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [app]);

  // 파일 투입 시 시작 버튼으로 포커스 이동 — Enter로 즉시 실행 (6.3 / 6.8)
  const convertibleCount = items.filter((it) => it.status !== "excluded").length;
  useEffect(() => {
    if (app === "S2" && convertibleCount > 0) {
      document.querySelector<HTMLButtonElement>("[data-role=start]")?.focus();
    }
  }, [app, convertibleCount]);

  // 전체 진행률 — 파일마다 알리면 시끄러우므로 전체만 (6.9)
  const announce = useMemo(() => {
    if (app === "S3") {
      const done = items.filter(
        (it) => it.status === "done" || it.status === "failed",
      ).length;
      const total = items.filter((it) => it.status !== "excluded").length;
      return `변환 중 · ${done} / ${total} 완료`;
    }
    if (app === "S4") {
      const done = items.filter((it) => it.status === "done").length;
      return `${done}장 변환 완료`;
    }
    return "";
  }, [app, items]);

  if (app === "S0") {
    return (
      <section className={styles.tool}>
        <FileZone />
      </section>
    );
  }

  if (app === "S1") {
    return (
      <section className={styles.tool}>
        <div className={styles.skeleton} aria-live="polite">
          파일을 확인하는 중…
        </div>
      </section>
    );
  }

  if (app === "S5") {
    return (
      <section className={styles.tool}>
        <div className={styles.errorState} role="alert">
          <p className={styles.errorTitle}>변환할 수 있는 파일이 없습니다</p>
          <p className={styles.errorBody}>
            지원하는 형식(HEIC · JPG · PNG · WebP · BMP · GIF)의 이미지를 넣어
            주세요.
          </p>
          <button type="button" className={styles.reset} onClick={clearAll}>
            다시 시작
          </button>
        </div>
      </section>
    );
  }

  // S2 / S3 / S4
  return (
    <section className={styles.tool}>
      <div aria-live="polite" className={styles.srOnly}>
        {announce}
      </div>

      {fallbackMode && (
        <p className={styles.fallback}>
          이 브라우저에서는 한 번에 하나씩 처리해 조금 느릴 수 있습니다.
        </p>
      )}

      <NoticeBanner />
      {app === "S4" && <ResultSummary />}

      <div className={styles.grid}>
        <SettingsPanel />

        <div className={styles.main}>
          {app !== "S3" && (
            <div className={styles.addBar}>
              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
              >
                + 추가
              </button>
              <button type="button" onClick={clearAll}>
                전체 삭제
              </button>
              <input
                ref={addInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length) void addFiles(files);
                }}
              />
            </div>
          )}

          <FileList />
        </div>
      </div>

      {/* 모바일: 시작 버튼 화면 하단 고정 (6.4) */}
      {app !== "S4" && (
        <div className={styles.mobileBar}>
          <PrimaryAction />
        </div>
      )}

      {compareItem && <CompareDialog item={compareItem} />}
    </section>
  );
}
