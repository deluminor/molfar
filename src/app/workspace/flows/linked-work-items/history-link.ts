import type { LinkedWorkItem } from "@/domain/session/session";
import { setSessionLinkedWorkItem } from "@/features/sessions/data/session-store";
import { alertApp } from "@/shared/lib/app-dialog";
import type { InboxDeps } from "../inbox/inbox-deps";

export type HistoryLinkDeps = Pick<InboxDeps, "store" | "sessionsRef" | "setSessions" | "sidebarCwd"> & {
  /** Drops what was loaded of the session, so it is read again with the new link. */
  forgetLoaded(sessionId: string): void;
  refreshHistory(cwd: string): Promise<unknown>;
};

/** Sets the link everywhere the chat shows: open, history and the inbox's linked chats. */
function applyLink(
  deps: HistoryLinkDeps,
  sessionId: string,
  linkedWorkItem: LinkedWorkItem | undefined,
  applies: (current: LinkedWorkItem | undefined) => boolean,
): void {
  const { setHistory, setStoredLinkedSessions } = deps.store.getState();
  const next = deps.sessionsRef.current.map((session) =>
    session.id === sessionId && applies(session.linkedWorkItem) ? { ...session, linkedWorkItem } : session,
  );
  deps.sessionsRef.current = next;
  deps.setSessions(next);
  setHistory((current) =>
    current.map((session) =>
      session.id === sessionId && applies(session.linkedWorkItem) ? { ...session, linkedWorkItem } : session,
    ),
  );
  setStoredLinkedSessions((current) =>
    linkedWorkItem
      ? current.map((session) => (session.id === sessionId ? { ...session, linkedWorkItem } : session))
      : current.filter((session) => session.id !== sessionId),
  );
}

/** Links a chat to a work item (or unlinks it), rolling back if the store refuses. */
export function setHistorySessionLinkedWorkItem(
  deps: HistoryLinkDeps,
  sessionId: string,
  linkedWorkItem: LinkedWorkItem | undefined,
): void {
  const previousLinkedWorkItem =
    deps.sessionsRef.current.find((session) => session.id === sessionId)?.linkedWorkItem ??
    deps.store.getState().history.find((session) => session.id === sessionId)?.linkedWorkItem;
  deps.forgetLoaded(sessionId);

  applyLink(deps, sessionId, linkedWorkItem, () => true);
  deps.store.getState().setLinkedWorkItemPanels((current) => {
    if (!current.has(sessionId)) return current;
    const next = new Map(current);
    next.delete(sessionId);
    return next;
  });

  void setSessionLinkedWorkItem(sessionId, linkedWorkItem).catch((error) => {
    applyLink(deps, sessionId, previousLinkedWorkItem, (current) => current === linkedWorkItem);
    void deps.refreshHistory(deps.sidebarCwd());
    void alertApp(`Could not update this conversation's GitHub link.\n\n${String(error)}`, {
      kind: "error",
    });
  });
}
