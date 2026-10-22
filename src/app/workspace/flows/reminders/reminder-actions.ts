import type { Session } from "@/domain/session/session";
import type { LinkedWorkItemUpdateCard } from "@/domain/work-items/linked-activity";
import { markLinkedSessionUpdateSeen } from "@/features/inbox/model/linked-session-seen";

type CardUpdate = (card: LinkedWorkItemUpdateCard | undefined) => LinkedWorkItemUpdateCard | undefined;

export type ReminderActionsDeps = {
  sessionsRef: { current: Session[] };
  upsertSession(session: Session): Promise<unknown>;
  dismissDueReminder(sessionId: string): Promise<void>;
  updateLinkedCard(sessionId: string, change: CardUpdate): void;
};

/** Saving chats a reminder points at, and clearing the notices a continued chat answers, created once for the workspace. */
export function createReminderActions(deps: ReminderActionsDeps) {
  const findSession = (sessionId: string) => deps.sessionsRef.current.find((session) => session.id === sessionId);

  const ensureSaved = async (ids: readonly string[]): Promise<void> => {
    for (const id of ids) {
      const session = findSession(id);
      if (session && !(await deps.upsertSession(session))) {
        throw new Error("Send a message in this conversation before setting a reminder.");
      }
    }
  };

  const dismissContinuedNotices = (sessionId: string): void => {
    void deps.dismissDueReminder(sessionId);
    const updatedAt = findSession(sessionId)?.linkedWorkItemUpdateCard?.updatedAt;
    if (updatedAt == null) return;

    markLinkedSessionUpdateSeen(sessionId, updatedAt);
    deps.updateLinkedCard(sessionId, (card) => (card?.updatedAt === updatedAt ? undefined : card));
  };

  return { ensureSaved, dismissContinuedNotices };
}
