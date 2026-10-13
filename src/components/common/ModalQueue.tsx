"use client";

/*
 * L3 모달, 전역 (5.3.2 / 6.6).
 *
 * - 화면 차단, 확인 필수. 배경 클릭으로 닫히지 않는다. Esc는 허용 (첫 액션으로 해석).
 * - 동시에 두 개를 띄우지 않는다 — 큐의 맨 앞만 렌더한다.
 * - 확인 버튼 외에 조치 버튼을 반드시 포함한다 (정보만 알리는 모달은 없다).
 * - 포커스 트랩, 닫으면 직전 포커스 위치로 복귀 (6.9).
 * - 최대폭 480px, 배경은 --ink 40% 오버레이.
 */

import { useEffect, useRef } from "react";
import { errorMessage } from "../tool/messages";
import { useNoticeStore } from "@/store/useNoticeStore";
import type { ErrorCode } from "@/core/types";
import styles from "./ModalQueue.module.css";

export default function ModalQueue() {
  const modal = useNoticeStore((s) => s.modals[0]);
  const resolveTop = useNoticeStore((s) => s.resolveTop);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!modal) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // 기본 포커스는 주 조치 버튼 (6.6)
    dialog?.querySelector<HTMLButtonElement>("[data-primary]")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        resolveTop(modal.actions[0]?.value ?? "close");
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>("button");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      restoreRef.current?.focus?.();
    };
  }, [modal, resolveTop]);

  if (!modal) return null;

  return (
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h2 id="modal-title" className={styles.title}>
          {modal.title}
        </h2>
        {modal.body && <p className={styles.body}>{modal.body}</p>}

        {modal.list && modal.list.length > 0 && (
          <ul className={styles.list}>
            {modal.list.map((row, i) => (
              <li key={i}>
                <span className={styles.rowName}>{row.name}</span>
                <span className={styles.rowReason}>
                  {errorMessage(row.reason as ErrorCode).short}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          {modal.actions.map((a) => (
            <button
              key={a.value}
              type="button"
              className={a.primary ? styles.primary : styles.secondary}
              data-primary={a.primary ? "" : undefined}
              onClick={() => resolveTop(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
