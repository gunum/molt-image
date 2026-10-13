/*
 * (E) 푸터 (6.2). W3에서는 최소 형태. 로고는 텍스트만으로 시작한다 (8.9 #5).
 */

import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span>molt image</span>
        <span className={styles.muted}>
          이미지는 이 기기에서만 처리됩니다 · 서버 전송 없음
        </span>
      </div>
    </footer>
  );
}
