import { announceProjectEvent } from "@/features/notifications/model/notifications";
import type { BoardNotice, NotifyPort } from "./ports";

/** Notification click payloads with this prefix open the board on a card. */
export const BOARD_NOTICE_PREFIX = "task-board:";

const SUBTITLE: Record<BoardNotice["kind"], string> = {
  gate: "Task Board · Waiting for you",
  failed: "Task Board · Stage failed",
  stalled: "Task Board · Stage running long",
};

export function boardNoticeCard(target: string): string | null {
  return target.startsWith(BOARD_NOTICE_PREFIX) ? target.slice(BOARD_NOTICE_PREFIX.length) : null;
}

export const systemBoardNotifier: NotifyPort = {
  notify(notice) {
    void announceProjectEvent({
      target: `${BOARD_NOTICE_PREFIX}${notice.cardId}`,
      projectCwd: notice.projectCwd,
      title: notice.title,
      subtitle: SUBTITLE[notice.kind],
      body: notice.body,
    });
  },
};
