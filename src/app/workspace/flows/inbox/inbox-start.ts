import type { InboxItem } from "@/features/inbox/model/github-tasks";
import { inboxComposerCard } from "@/features/inbox/model/github-tasks";
import { inboxTrackerDescription } from "@/features/inbox/model/inbox-context";
import { newDefaultSession } from "@/features/sessions/model/session";
import { linkedWorkItemFromInboxItem } from "@/features/sessions/model/session-work-item";
import { type InboxDeps, leaveOverlayViews, openComposerSession } from "./inbox-deps";

function itemRef(item: InboxItem): string {
  return item.provider === "linear" || item.provider === "jira"
    ? item.identifier?.trim() || `#${item.number}`
    : `#${item.number}`;
}

/** Starts a chat on an inbox item, linked to it, with its description in the composer. */
export async function startInboxItem(deps: InboxDeps, item: InboxItem, body?: string): Promise<void> {
  const description = await inboxTrackerDescription(item, body);
  leaveOverlayViews(deps);

  const cwd = item.projectPath || deps.defaultCwd();
  const linkedWorkItem = linkedWorkItemFromInboxItem(item);
  const session = {
    ...newDefaultSession(cwd, deps.runtimeMode()),
    title: `${itemRef(item)} ${item.title}`,
    inboxCard: inboxComposerCard(item, description),
    ...(linkedWorkItem ? { linkedWorkItem } : {}),
  };
  openComposerSession(deps, session, cwd);
}

/** Leaves the inbox for one of its related chats. */
export function openInboxSession(deps: InboxDeps, sessionId: string): void {
  const { setInboxViewOpen, history } = deps.store.getState();
  setInboxViewOpen(false);
  const cwd =
    deps.sessionsRef.current.find((session) => session.id === sessionId)?.cwd ??
    history.find((session) => session.id === sessionId)?.cwd;
  deps.setSidebarTab("sessions", cwd);
  void deps.selectHistorySession(sessionId);
}
