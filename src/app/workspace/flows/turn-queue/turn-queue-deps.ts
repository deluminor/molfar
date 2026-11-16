import type { Session } from "@/domain/session/session";
import type { HarnessEvent } from "@/integrations/harness";
import type { Submit } from "../submission/submit-types";

export type TurnQueueDeps = {
  sessions(): Session[];
  updateSessions(update: (prev: Session[]) => Session[]): void;
  /** Writes through the sessions ref at once, before React renders. */
  updateSessionsNow(update: (prev: Session[]) => Session[]): void;
  /** Submits as the composer does; false when the turn was refused. */
  submit(...args: Parameters<Submit>): boolean;
  enqueueHarnessEvent(sessionId: string, event: HarnessEvent): void;
  flushHarnessEvents(): void;
};

export function mapSession(
  sessionId: string,
  update: (session: Session) => Session,
): (prev: Session[]) => Session[] {
  return (prev) => prev.map((session) => (session.id === sessionId ? update(session) : session));
}
