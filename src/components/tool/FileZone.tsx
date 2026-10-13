"use client";

/*
 * S0 파일 투입 영역 (6.3 / 5.4).
 *
 * - 페이지 어디에나 파일을 끌어오면 이 영역이 --core 실선으로 바뀌고 배경이 옅게 채워진다.
 * - role="button" + tabindex=0, Enter/Space로 파일 선택창을 연다 (6.9).
 * - 붙여넣기(Ctrl/Cmd+V)로 클립보드 이미지 투입 (5.4 / 6.8).
 * - "빈 화면은 지시문이다" — 여기에 놓으세요 (6.1.4).
 * - 폴더 드롭은 하위 폴더까지 재귀 탐색한다 (5.4).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useFileStore } from "@/store/useFileStore";
import { useNoticeStore } from "@/store/useNoticeStore";
import styles from "./FileZone.module.css";

/** DataTransfer에서 파일을 모은다. 디렉터리 항목은 재귀 탐색 (5.4) */
async function collectFiles(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items).filter((i) => i.kind === "file");
  const entries = items
    .map((i) => i.webkitGetAsEntry?.() ?? null)
    .filter(Boolean) as FileSystemEntry[];

  if (entries.length === 0) return Array.from(dt.files);

  const out: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej),
      );
      out.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries는 한 번에 일부만 반환 — 빌 때까지 반복
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) =>
          reader.readEntries(res, rej),
        );
        for (const child of batch) await walk(child);
      } while (batch.length > 0);
    }
  };
  await Promise.all(entries.map(walk));
  return out;
}

export default function FileZone({ compact = false }: { compact?: boolean }) {
  const addFiles = useFileStore((s) => s.addFiles);
  const pushModal = useNoticeStore((s) => s.pushModal);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = useCallback(
    (list: FileList | null | undefined) => {
      const files = Array.from(list ?? []);
      if (files.length) void addFiles(files);
    },
    [addFiles],
  );

  const takeDrop = useCallback(
    async (dt: DataTransfer | null) => {
      if (!dt) return;
      const files = await collectFiles(dt);
      if (files.length === 0) {
        pushModal({
          title: "이미지 파일을 찾지 못했습니다",
          body: "폴더 안에 지원하는 형식의 이미지가 없습니다.",
          actions: [{ label: "확인", value: "ok", primary: true }],
        });
        return;
      }
      void addFiles(files);
    },
    [addFiles, pushModal],
  );

  // 페이지 전체가 드롭 영역 (5.4)
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        setDragging(true);
      }
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void takeDrop(e.dataTransfer);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [takeDrop]);

  // 붙여넣기 (5.4 / 6.8)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const openPicker = () => inputRef.current?.click();

  return (
    <div
      className={`${styles.zone} ${dragging ? styles.dragging : ""} ${
        compact ? styles.compact : ""
      }`}
      role="button"
      tabIndex={0}
      aria-label="이미지 파일 선택 또는 여기에 끌어놓기"
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      }}
    >
      <p className={styles.prompt}>이미지를 여기에 놓으세요</p>
      <button
        type="button"
        className={styles.pick}
        onClick={(e) => {
          e.stopPropagation();
          openPicker();
        }}
      >
        파일 선택
      </button>
      <p className={styles.formats}>HEIC · JPG · PNG · WebP · BMP · GIF</p>
      <p className={styles.hint}>붙여넣기(Ctrl+V)도 가능</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
