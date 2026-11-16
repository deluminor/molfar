import type { Session } from "@/domain/session/session";
import type { HarnessEvent } from "@/integrations/harness";

export type TurnControlDeps = {
  sessions(): Session[];
  /** Publishes `next` at once: sessions ref, dock badge and store. */
  commitSessions(next: Session[]): void;
  updateSessions(update: (prev: Session[]) => Session[]): void;
  /** Turn generation per session; a bump orphans the running turn's events. */
  turnGen: Map<string, number>;
  enqueueHarnessEvent(sessionId: string, event: HarnessEvent): void;
  flushHarnessEvents(): void;
};
