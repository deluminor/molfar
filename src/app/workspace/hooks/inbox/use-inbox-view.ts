import { useMemo } from "react";
import type { Session } from "@/domain/session/session";
import { ciRepairSessions } from "@/features/inbox/model/ci-repair-sessions";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { inboxRelatedSessions as relatedInboxSessions } from "../../flows/inbox/inbox-related-sessions";

/** The chats the Inbox links to its items, and those that repair failing checks. */
export function useInboxView(
  storedLinkedSessions: SessionSummary[],
  history: SessionSummary[],
  sessions: Session[],
): { inboxRelatedSessions: SessionSummary[]; repairSessions: SessionSummary[] } {
  const inboxRelatedSessions = useMemo(
    () => relatedInboxSessions(storedLinkedSessions, history, sessions),
    [history, sessions, storedLinkedSessions],
  );
  const repairSessions = useMemo(
    () => ciRepairSessions(history, sessions),
    [history, sessions],
  );

  return { inboxRelatedSessions, repairSessions };
}
