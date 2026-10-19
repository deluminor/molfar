import type { QueuedMessage } from "@/domain/session/message-queue";
import type { Session } from "@/domain/session/session";
import { familiarForSession } from "@/features/familiars/model/familiar";
import { canDispatchQueuedHead, canSteerQueuedHead } from "@/features/sessions/model/message-queue";
import { consumeOperatorCommand } from "@/features/sessions/model/operator-command";
import { canSteerHarness } from "@/integrations/harness";
import type { Submit } from "../submission/submit-types";
import { mapSession, type TurnQueueDeps } from "./turn-queue-deps";

export type QueueDispatchDeps = Pick<TurnQueueDeps, "sessions" | "updateSessions"> & {
  /** Resolves once the turn was accepted or refused. */
  submitSession: Submit;
  /** Session ids whose queue head is on its way. */
  dispatching: Set<string>;
  /** Looks at the queues again after a head went out. */
  redispatch(): void;
};

/** A Familiar takes its queued head mid-turn as a steer; others wait until idle. */
export function canSendQueuedHead(session: Session, head: QueuedMessage): boolean {
  if (canDispatchQueuedHead(session)) return true;
  return (
    !!familiarForSession(session.id) &&
    canSteerQueuedHead(session) &&
    canSteerHarness(session.harness) &&
    !consumeOperatorCommand(head.text).matched
  );
}

export function withQueuedMessageError(
  session: Session,
  messageId: string,
  error: string,
): Session {
  return {
    ...session,
    queueStatus: "paused",
    queuedMessages: session.queuedMessages?.map((message) =>
      message.id === messageId ? { ...message, error } : message,
    ),
  };
}

function setSending(deps: QueueDispatchDeps, sessionId: string, messageId?: string): void {
  deps.updateSessions(
    mapSession(sessionId, (entry) => ({ ...entry, sendingQueuedMessageId: messageId })),
  );
}

/** A Familiar's refused head pauses with an error instead of retrying forever. */
function pauseRefusedFamiliarHead(
  deps: QueueDispatchDeps,
  sessionId: string,
  head: QueuedMessage,
  steering: boolean,
): void {
  const current = deps.sessions().find((entry) => entry.id === sessionId);
  if (
    !current ||
    !(steering ? canSteerQueuedHead(current) : canDispatchQueuedHead(current)) ||
    current.queuedMessages?.[0] !== head
  )
    return;

  deps.updateSessions(
    mapSession(sessionId, (entry) =>
      withQueuedMessageError(
        entry,
        head.id,
        "Delivery is unavailable. Retry when the agent is ready.",
      ),
    ),
  );
}

/** Sends the session's queue head if it is still `nextId` and still sendable. */
export async function dispatchQueuedHead(
  deps: QueueDispatchDeps,
  sessionId: string,
  nextId: string,
): Promise<void> {
  const latest = deps.sessions().find((entry) => entry.id === sessionId);
  const head = latest?.queuedMessages?.[0];
  if (!latest || !head || head.id !== nextId || !canSendQueuedHead(latest, head)) {
    deps.dispatching.delete(sessionId);
    return;
  }

  const steering = latest.busy === true;
  if (steering) setSending(deps, sessionId, head.id);
  try {
    const accepted = await deps.submitSession(sessionId, head.text, head.attachments, {
      queuedMessageId: head.id,
      followUpBehavior: steering ? "steer" : undefined,
      noteCard: head.noteCard,
      handoffCard: head.handoffCard,
      intent: head.intent,
      ...(head.familiarSessionCompletion
        ? { familiarSessionCompletion: head.familiarSessionCompletion, appRequestId: head.id }
        : {}),
    });
    if (!accepted && familiarForSession(sessionId))
      pauseRefusedFamiliarHead(deps, sessionId, head, steering);
    if (accepted || steering) deps.redispatch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.updateSessions(
      mapSession(sessionId, (entry) => withQueuedMessageError(entry, head.id, message)),
    );
  } finally {
    deps.dispatching.delete(sessionId);
    if (steering) setSending(deps, sessionId, undefined);
  }
}
