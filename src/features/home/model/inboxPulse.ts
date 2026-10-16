import { inboxItemKey, type InboxItem } from "../../inbox/model/githubTasks";
import { inboxUpdatedAt } from "../../inbox/model/inboxSeen";

export const INBOX_PULSE_LIMIT = 5;

export type InboxPulseRow = {
  key: string;
  title: string;
  meta: string;
  unseen: boolean;
};

export type InboxPulse = {
  attentionCount: number;
  rows: InboxPulseRow[];
};

function itemMeta(item: InboxItem): string {
  return item.identifier ?? `${item.repo} #${item.number}`;
}

/** Unseen items need attention; they lead, then the most recently updated. */
export function inboxPulse(
  items: readonly InboxItem[],
  isUnseen: (item: InboxItem) => boolean,
  limit = INBOX_PULSE_LIMIT,
): InboxPulse {
  const ranked = items
    .map((item) => ({ item, unseen: isUnseen(item) }))
    .sort(
      (a, b) =>
        Number(b.unseen) - Number(a.unseen) ||
        inboxUpdatedAt(b.item) - inboxUpdatedAt(a.item),
    );

  return {
    attentionCount: ranked.filter((entry) => entry.unseen).length,
    rows: ranked.slice(0, Math.max(0, limit)).map(({ item, unseen }) => ({
      key: inboxItemKey(item),
      title: item.title,
      meta: itemMeta(item),
      unseen,
    })),
  };
}
