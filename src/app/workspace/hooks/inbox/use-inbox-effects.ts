import { useEffect } from "react";
import { listLinkedSessions } from "@/features/sessions/data/session-store";
import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";
import type { WorkspaceState, WorkspaceStore } from "../../store/types";
import { useWorkspaceActions } from "../use-workspace-actions";

/** Panels are tab-local UI. Keep mounted panels alive while their tab is in
 * the workspace so switching away preserves the fetched issue and its UI
 * state, then discard them when their session leaves every open tab. */
export function useLinkedPanelPrune(store: WorkspaceStore, tabs: WorkspaceTab[]): void {
  const { setLinkedWorkItemPanels } = useWorkspaceActions(store);

  useEffect(() => {
    const openSessionIds = new Set(tabs.flatMap((tab) => leafIds(tab.layout)));
    setLinkedWorkItemPanels((current) => {
      if ([...current.keys()].every((id) => openSessionIds.has(id))) {
        return current;
      }
      return new Map([...current].filter(([id]) => openSessionIds.has(id)));
    });
  }, [tabs]);
}

/** Loads the saved linked chats each time the Inbox opens. */
export function useInboxLinkedSessions(store: WorkspaceStore, inboxViewOpen: boolean): void {
  const { setStoredLinkedSessions } = useWorkspaceActions(store);

  useEffect(() => {
    if (!inboxViewOpen) return;
    let cancelled = false;
    void listLinkedSessions()
      .then((rows) => {
        if (!cancelled) setStoredLinkedSessions(rows);
      })
      .catch(() => {
        // Already-loaded and live sessions still provide a useful fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [inboxViewOpen]);
}

/** An Ask chat opened in the Inbox takes the composer focus. */
export function useInboxAskFocus(
  inboxAskPortal: WorkspaceState["inboxAskPortal"],
  inboxViewOpen: boolean,
  setComposerFocused: (focused: boolean) => void,
): void {
  useEffect(() => {
    if (!inboxAskPortal || !inboxViewOpen) return;
    setComposerFocused(true);
  }, [inboxAskPortal, inboxViewOpen, setComposerFocused]);
}
