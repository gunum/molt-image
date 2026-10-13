"use client";

/*
 * 5.5 F-02 파일 목록 · 6.3 S2/S3/S4.
 *
 * 제외된 파일도 목록에 남긴다 — 사유를 그 자리에서 읽을 수 있어야 한다 (5.4 / 6.3).
 * 20장을 넘으면 가상 스크롤로 렌더링한다 (5.5) — 보이는 범위 ± 여유분만 DOM에 올린다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFileStore } from "@/store/useFileStore";
import FileItem from "./FileItem";
import styles from "./FileList.module.css";

const VIRTUAL_THRESHOLD = 20;
const ROW_HEIGHT = 82; // 항목 높이(px) 근사 — gap 포함
const OVERSCAN = 6;

export default function FileList() {
  const items = useFileStore((s) => s.items);
  const convertible = items.filter((it) => it.status !== "excluded").length;
  const excluded = items.length - convertible;

  return (
    <div className={styles.wrap}>
      <p className={styles.count}>
        파일 {convertible}장{excluded > 0 && ` · 제외 ${excluded}장`}
      </p>
      {items.length > VIRTUAL_THRESHOLD ? (
        <VirtualList ids={items.map((it) => it.id)} />
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <FileItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function VirtualList({ ids }: { ids: string[] }) {
  const items = useFileStore((s) => s.items);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 30 });

  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(el.clientHeight / ROW_HEIGHT);
    setRange({ start, end: start + visible + OVERSCAN * 2 });
  }, []);

  useEffect(() => {
    recompute();
  }, [recompute, ids.length]);

  const byId = new Map(items.map((it) => [it.id, it]));
  const slice = ids.slice(range.start, range.end);

  return (
    <div
      ref={scrollRef}
      className={styles.viewport}
      onScroll={recompute}
      style={{ maxHeight: "70vh", overflowY: "auto" }}
    >
      <div style={{ height: ids.length * ROW_HEIGHT, position: "relative" }}>
        <ul
          className={styles.list}
          style={{
            position: "absolute",
            top: range.start * ROW_HEIGHT,
            left: 0,
            right: 0,
          }}
        >
          {slice.map((id) => {
            const item = byId.get(id);
            return item ? <FileItem key={id} item={item} /> : null;
          })}
        </ul>
      </div>
    </div>
  );
}
