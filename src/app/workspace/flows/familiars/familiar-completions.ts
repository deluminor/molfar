import type { QueuedMessage } from "@/domain/session/message-queue";
import type { Session } from "@/domain/session/session";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import {
  enqueueFamiliarSessionCompletion,
  FamiliarSessionCompletionBatches,
} from "@/features/familiars/model/familiar-session-completion";
import type { StateUpdate } from "../../store/state-update";

export type FamiliarCompletionsDeps = {
  ensureOpenSession(sessionId: string): Promise<Session | null>;
  isRemoving(sessionId: string): boolean;
  setSessions(update: StateUpdate<Session[]>): void;
  /** Whether the Familiar is still busy on the turn that launched the batch. */
  isBusyOnTurn(familiarId: string, turn: number): boolean;
};

/**
 * Batches the results of sessions a Familiar launched and queues each batch
 * into the Familiar's chat as one message.
 */
export function createFamiliarCompletions(deps: FamiliarCompletionsDeps) {
  const queue = async (
    familiarId: string,
    message: QueuedMessage,
    current: () => QueuedMessage | undefined = () => message,
  ): Promise<void> => {
    if (!isFamiliarSession(familiarId) || deps.isRemoving(familiarId)) return;
    if (!(await deps.ensureOpenSession(familiarId)) || deps.isRemoving(familiarId)) return;

    deps.setSessions((previous) => {
      const latest = current();
      return latest
        ? previous.map((session) =>
            session.id === familiarId
              ? enqueueFamiliarSessionCompletion(session, latest)
              : session,
          )
        : previous;
    });
  };
  const batches = new FamiliarSessionCompletionBatches((familiarId, message, current) => {
    void queue(familiarId, message, current);
  });

  return {
    batches,
    /** Closes the batches whose Familiar moved past the launching turn. */
    closeInactive: (): void =>
      batches.closeInactive(({ familiarId, turn }) => deps.isBusyOnTurn(familiarId, turn)),
  };
}
