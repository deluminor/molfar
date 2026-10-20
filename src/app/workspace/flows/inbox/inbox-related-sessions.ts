import type { Session } from "@/domain/session/session";
import { summaryFromSession } from "@/features/sessions/data/session-history";
import type { SessionSummary } from "@/features/sessions/data/session-store";

/** Chats linked to a work item, from storage, history and open sessions, newest first. */
export function inboxRelatedSessions(
  stored: SessionSummary[],
  history: SessionSummary[],
  sessions: Session[],
): SessionSummary[] {
  const byId = new Map<string, SessionSummary>();
  for (const session of stored) byId.set(session.id, session);
  for (const session of history) {
    if (session.linkedWorkItem) byId.set(session.id, session);
  }
  for (const session of sessions) {
    if (session.inboxAsk || !session.linkedWorkItem) continue;
    const current = byId.get(session.id);
    const summary = summaryFromSession(session);
    byId.set(
      session.id,
      current
        ? {
            ...current,
            harness: summary.harness,
            model: summary.model,
            runtimeMode: summary.runtimeMode,
            title: summary.title,
            cwd: summary.cwd,
            linkedWorkItem: summary.linkedWorkItem,
          }
        : summary,
    );
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}
