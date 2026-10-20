import type { LinkedWorkItem } from "@/domain/session/session";
import type { InboxDeps } from "../inbox/inbox-deps";

export type LinkedPanelDeps = Pick<InboxDeps, "store" | "sessionsRef" | "closeAutomations" | "sidebarCwd" | "selectHistorySession">;

/** The work item panel beside a linked chat; a newer request wins over a pending one. */
export function createLinkedWorkItemPanels(deps: LinkedPanelDeps) {
  let request = 0;

  const close = (sessionId: string): void => {
    request += 1;
    deps.store.getState().setLinkedWorkItemPanels((current) => {
      if (!current.has(sessionId)) return current;
      const next = new Map(current);
      next.delete(sessionId);
      return next;
    });
  };

  const open = (item: LinkedWorkItem, sessionId: string): void => {
    request += 1;
    const opened = request;
    const state = deps.store.getState();
    state.setFilePickerOpen(false);
    state.setSettingsOpen(false);
    state.setSearchViewOpen(false);
    state.setNotesViewOpen(false);
    deps.closeAutomations();
    state.setInboxViewOpen(false);
    const cwd =
      deps.sessionsRef.current.find((session) => session.id === sessionId)?.cwd ??
      state.history.find((session) => session.id === sessionId)?.cwd ??
      deps.sidebarCwd();

    void deps.selectHistorySession(sessionId).then(() => {
      if (request !== opened) return;
      if (!deps.sessionsRef.current.some((session) => session.id === sessionId)) return;
      deps.store.getState().setLinkedWorkItemPanels((current) => {
        const next = new Map(current);
        // Reinsert the panel so it wins if this workspace tab contains
        // multiple sessions with remembered panels.
        next.delete(sessionId);
        next.set(sessionId, { item, sessionId, cwd });
        return next;
      });
    });
  };

  return { open, close };
}
