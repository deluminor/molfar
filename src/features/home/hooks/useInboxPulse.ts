import { useEffect, useState } from "react";
import {
  inboxItemKey,
  inboxProjectsForRail,
  listInboxItems,
  type InboxItem,
} from "../../inbox/model/githubTasks";
import { applyInboxFiltersBySource } from "../../inbox/model/inboxFilters";
import {
  isInboxEntryUnseen,
  useInboxSeenTick,
} from "../../inbox/model/inboxSeen";
import { inboxActivityRequest } from "../../inbox/hooks/useInboxUnseen";
import { inboxPulse, type InboxPulse } from "../model/inboxPulse";

export type InboxPulseState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; pulse: InboxPulse };

function isUnseen(item: InboxItem): boolean {
  return isInboxEntryUnseen({
    key: inboxItemKey(item),
    updatedAt: item.updatedAt,
  });
}

/** Same query and list cache as the Inbox background poll, so Home adds no extra fetch path. */
export function useInboxPulse(
  projectPaths: readonly string[],
  cwd: string,
): InboxPulseState {
  const [items, setItems] = useState<InboxItem[] | null | "error">(null);
  // Re-render when items are marked seen elsewhere; unseen state lives in storage.
  useInboxSeenTick();

  const pathsKey = projectPaths.join("\0");

  useEffect(() => {
    const paths = pathsKey ? pathsKey.split("\0") : [];
    const projects = inboxProjectsForRail(
      paths.map((path) => ({ path, openedAt: 0 })),
      cwd,
    );
    if (projects.length === 0) {
      setItems([]);
      return;
    }

    let cancelled = false;
    const { pruned, query } = inboxActivityRequest(
      projects.map((project) => project.path),
    );
    listInboxItems(projects, query)
      .then((listed) => {
        if (cancelled) return;
        setItems(applyInboxFiltersBySource(listed.items, pruned, ""));
      })
      .catch((error: unknown) => {
        console.error("Failed to load Home inbox pulse:", error);
        if (!cancelled) setItems("error");
      });
    return () => {
      cancelled = true;
    };
  }, [pathsKey, cwd]);

  if (items === null) return { status: "loading" };
  if (items === "error") return { status: "unavailable" };
  return { status: "ready", pulse: inboxPulse(items, isUnseen) };
}
