"use client";

/*
 * L2 배너 (5.3.2). 도구 영역 상단 고정 띠, 두 단에 걸침 (6.3).
 * 사용자가 닫을 때까지 유지. 닫으면 같은 세션에서 반복 표시하지 않는다.
 * 배너 목록은 items·settings에서 파생한다 (notices.ts).
 */

import { useMemo } from "react";
import { useFileStore } from "@/store/useFileStore";
import { useNoticeStore } from "@/store/useNoticeStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { computeBanners } from "../tool/notices";
import styles from "./NoticeBanner.module.css";

export default function NoticeBanner() {
  const items = useFileStore((s) => s.items);
  const settings = useSettingsStore((s) => s.settings);
  const keepFormat = useSettingsStore((s) => s.keepFormat);
  const patch = useSettingsStore((s) => s.patch);
  const dismissed = useNoticeStore((s) => s.dismissed);
  const dismissBanner = useNoticeStore((s) => s.dismissBanner);

  const banners = useMemo(
    () => computeBanners(items, settings, keepFormat),
    [items, settings, keepFormat],
  );
  const visible = banners.filter((b) => !dismissed.includes(b.key));
  if (visible.length === 0) return null;

  return (
    <div className={styles.stack} role="region" aria-label="변환 전 안내">
      {visible.map((b) => (
        <div key={b.key} className={styles.banner}>
          <span className={styles.icon} aria-hidden>
            !
          </span>
          <p className={styles.msg}>{b.message}</p>
          {b.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => patch(b.action!.patch)}
            >
              {b.action.label}
            </button>
          )}
          <button
            type="button"
            className={styles.close}
            aria-label="안내 닫기"
            onClick={() => dismissBanner(b.key)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
