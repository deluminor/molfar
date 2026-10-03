import { summaryFromSession } from "@/features/sessions/data/session-history";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { isPreparingHandoff } from "@/features/sessions/model/handoff";
import type { Session } from "@/features/sessions/model/session";

export function ciRepairSessions(
  history: readonly SessionSummary[],
  sessions: readonly Session[],
): SessionSummary[] {
  const unavailable = new Set(
    sessions
      .filter(
        (session) =>
          session.busy || session.pendingSwitch || isPreparingHandoff(session),
      )
      .map((session) => session.id),
  );
  return [
    ...new Map(
      [
        ...history,
        ...sessions
          .filter((session) => !session.inboxAsk)
          .map((session) => summaryFromSession(session)),
      ].map((session) => [session.id, session]),
    ).values(),
  ].filter((session) => !unavailable.has(session.id) && !session.worktreeRemoved);
}
