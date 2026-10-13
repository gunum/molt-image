"use client";

/*
 * (B) 프라이버시 표시 (5.3.1 / 6.2). 스크롤해도 상단 고정.
 *
 * "업로드하지 않는다"는 이 제품의 유일한 차별점이므로 문구가 아니라 상태 표시로 보여준다.
 * 변환 중에는 처리 중인 파일 수를 함께 표시한다.
 * 클릭 시 검증 방법(개발자 도구 네트워크 탭)을 안내한다 — "안전합니다"가 아니라 확인법.
 */

import { useState } from "react";
import { useFileStore } from "@/store/useFileStore";
import styles from "./PrivacyIndicator.module.css";

export default function PrivacyIndicator() {
  const [open, setOpen] = useState(false);
  const app = useFileStore((s) => s.app);
  const processing = useFileStore(
    (s) => s.items.filter((it) => it.status === "processing").length,
  );

  const label =
    app === "S3" && processing > 0
      ? `이 기기에서 처리 중 · ${processing}개 변환 · 서버 전송 없음`
      : "이 기기에서 처리됩니다 · 서버 전송 없음";

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        <p className={styles.text}>
          <span className={styles.dot} aria-hidden /> {label}
        </p>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          확인 방법 {open ? "▴" : "▾"}
        </button>
      </div>
      {open && (
        <div className={styles.panel}>
          <p>
            브라우저 개발자 도구의 <strong>네트워크</strong> 탭을 열어 둔 채로
            변환해 보세요. 이미지가 전송되는 요청이 없습니다. 변환은 전부 이
            브라우저 안에서 이루어집니다.
          </p>
          <p className={styles.muted}>
            정적 파일(JS·WASM·폰트) 외의 네트워크 요청은 존재하지 않습니다.
          </p>
        </div>
      )}
    </div>
  );
}
