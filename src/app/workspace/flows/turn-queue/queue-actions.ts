import { familiarForSession } from "@/features/familiars/model/familiar";
import { resumeFamiliarUsageLimit } from "@/features/familiars/model/familiar-usage-limit";
import { CONTINUE_PROMPT } from "@/features/sessions/model/in-flight";
import {
  dequeueQueuedMessage,
  queuedMessageForSubmit,
} from "@/features/sessions/model/message-queue";
import { mapSession, type TurnQueueDeps } from "./turn-queue-deps";

export function removeQueuedMessage(deps: TurnQueueDeps, sessionId: string, messageId: string): void {
  deps.updateSessions(mapSession(sessionId, (session) => dequeueQueuedMessage(session, messageId)));
}

export function setQueuedMessageEditing(
  deps: TurnQueueDeps,
  sessionId: string,
  messageId?: string,
): void {
  deps.updateSessions(
    mapSession(sessionId, (session) => ({ ...session, editingQueuedMessageId: messageId })),
  );
}

export function editQueuedMessage(
  deps: TurnQueueDeps,
  sessionId: string,
  messageId: string,
  text: string,
): void {
  deps.updateSessions(
    mapSession(sessionId, (session) => ({
      ...session,
      queuedMessages: session.queuedMessages?.map((message) =>
        message.id === messageId ? { ...message, text, error: undefined } : message,
      ),
      editingQueuedMessageId: undefined,
    })),
  );
}

/** Sends a queued message into the running turn now. */
export function steerQueuedMessage(deps: TurnQueueDeps, sessionId: string, messageId: string): void {
  const session = deps.sessions().find((entry) => entry.id === sessionId);
  const message = session ? queuedMessageForSubmit(session, messageId, "steer") : undefined;
  if (!session || !message) return;

  if (message.intent === "orchestrate" && session.busy) {
    deps.enqueueHarnessEvent(sessionId, {
      type: "status",
      text: "Orchestration planning will start after the current turn finishes.",
    });
    deps.flushHarnessEvents();
    return;
  }
  deps.submit(sessionId, message.text, message.attachments, {
    followUpBehavior: "steer",
    queuedMessageId: message.id,
    noteCard: message.noteCard,
    handoffCard: message.handoffCard,
    intent: message.intent,
  });
}

/**
 * Resumes a paused queue. A Familiar just lets it drain again; any other
 * session continues the interrupted turn first.
 */
export function resumeQueue(deps: TurnQueueDeps, sessionId: string): void {
  const session = deps.sessions().find((entry) => entry.id === sessionId);
  const familiar = !!familiarForSession(sessionId);
  if (
    !session ||
    (session.busy && !familiar) ||
    session.queueStatus !== "paused" ||
    !session.queuedMessages?.length
  ) {
    return;
  }

  if (familiar) {
    deps.updateSessions(
      mapSession(sessionId, (entry) =>
        entry.usageLimit
          ? resumeFamiliarUsageLimit(entry)
          : {
              ...entry,
              queueStatus: "active",
              queuedMessages: entry.queuedMessages?.map((message) => ({
                ...message,
                error: undefined,
              })),
            },
      ),
    );
    return;
  }
  deps.updateSessions(mapSession(sessionId, (entry) => ({ ...entry, queueStatus: "resuming" })));
  deps.submit(sessionId, CONTINUE_PROMPT, [], { followUpBehavior: "steer" });
}
