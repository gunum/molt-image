/*
 * (A) 헤더 (6.2 / 6.3). 로고 + 상단 메뉴.
 * 메뉴는 랜딩 경로로의 내부 링크 — 색인에도 도움 (6.5).
 */

import Link from "next/link";
import styles from "./Header.module.css";

const NAV = [
  { href: "/heic-to-jpg", label: "HEIC 변환" },
  { href: "/compress-image", label: "압축" },
  { href: "/resize-image", label: "크기 변경" },
  { href: "/png-to-webp", label: "포맷 변환" },
  { href: "/png-to-svg", label: "벡터화" },
];

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.wordmark}>
          molt image
        </Link>
        <nav className={styles.nav}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
