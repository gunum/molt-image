/*
 * 5.3.2 알림 체계.
 *
 *   L1 인라인  — 화면 상태로 존재 (제외 사유, 완료 요약, 상태 배지). 별도 저장 없음.
 *   L2 배너    — 도구 영역 상단 고정 띠. 사용자가 닫을 때까지. 실행 전 경고 (5.3.2)
 *   L3 모달    — 화면 차단, 확인 필수. 큐에 넣어 순차 표시 (6.6)
 *
 * L2 배너 목록은 items·settings에서 파생한다 (components/tool/notices.ts).
 * 이 스토어는 "닫은 배너"와 "모달 큐"만 들고 있다.
 *
 * 닫은 배너는 같은 세션에서 반복 표시하지 않되, 새 세션에서 조건이 다시 생기면
 * 다시 표시한다 (5.3.2) → sessionStorage 사용 (5.13은 localStorage로 적었으나
 * "새 세션에서 재표시" 요구에는 sessionStorage가 맞다).
 */

import { create } from "zustand";

export interface ModalAction {
  label: string;
  value: string;
  primary?: boolean;
}

export interface ModalSpec {
  title: string;
  body?: string;
  /** 부분 실패 등 항목 목록 (6.6) */
  list?: { name: string; reason: string }[];
  actions: ModalAction[];
}

interface QueuedModal extends ModalSpec {
  id: string;
  resolve: (value: string) => void;
}

const SS_KEY = "dismissedNotices";

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SS_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeDismissed(list: string[]): void {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(list));
  } catch {
    /* 무시 */
  }
}

let modalSeq = 0;

interface NoticeState {
  modals: QueuedModal[];
  dismissed: string[];
  pushModal: (spec: ModalSpec, onResolve?: (value: string) => void) => void;
  resolveTop: (value: string) => void;
  dismissBanner: (key: string) => void;
  isDismissed: (key: string) => boolean;
}

export const useNoticeStore = create<NoticeState>((set, get) => ({
  modals: [],
  dismissed: typeof window !== "undefined" ? readDismissed() : [],

  pushModal: (spec, onResolve) => {
    const modal: QueuedModal = {
      ...spec,
      id: `m${++modalSeq}`,
      resolve: onResolve ?? (() => {}),
    };
    set({ modals: [...get().modals, modal] });
  },

  resolveTop: (value) => {
    const [top, ...rest] = get().modals;
    if (!top) return;
    set({ modals: rest });
    top.resolve(value);
  },

  dismissBanner: (key) => {
    if (get().dismissed.includes(key)) return;
    const next = [...get().dismissed, key];
    set({ dismissed: next });
    writeDismissed(next);
  },

  isDismissed: (key) => get().dismissed.includes(key),
}));
