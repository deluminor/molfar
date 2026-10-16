import { useEffect, useState } from "react";
import {
  inboxItemKey,
  inboxProjectsForRail,
  listInboxItems,
  type InboxItem,
} from "../../inbox/model/githubTasks";
import { applyInboxFiltersBySource } from "../../inbox/model/inboxFilters";
import { inboxActivityRequest } from "../../inbox/model/inboxActivityRequest";
import {
  isInboxEntryUnseen,
  useInboxSeenTick,
} from "../../inbox/model/inboxSeen";
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
  enabled = true,
): InboxPulseState {
  const [items, setItems] = useState<InboxItem[] | null | "error">(null);
  // Re-render when items are marked seen elsewhere; unseen state lives in storage.
  useInboxSeenTick();

  const pathsKey = projectPaths.join("\0");

  useEffect(() => {
    if (!enabled) {
      setItems(null);
      return;
    }

    setItems(null);

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
        const visible = applyInboxFiltersBySource(listed.items, pruned, "");
        // Empty + provider errors is "unavailable", not a falsely clear inbox.
        if (visible.length === 0 && Object.keys(listed.errors).length > 0) {
          setItems("error");
          return;
        }
        setItems(visible);
      })
      .catch((error: unknown) => {
        console.error("Failed to load Home inbox pulse:", error);
        if (!cancelled) setItems("error");
      });
    return () => {
      cancelled = true;
    };
  }, [pathsKey, cwd, enabled]);

  if (items === null) return { status: "loading" };
  if (items === "error") return { status: "unavailable" };
  return { status: "ready", pulse: inboxPulse(items, isUnseen) };
}
