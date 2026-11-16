import type { Session } from "@/domain/session/session";
import {
  acknowledgeFamiliarMessage,
  enqueueFamiliarMessage,
} from "@/features/familiars/model/familiar-messaging";
import { inboxAskPrompt } from "@/features/inbox/model/inbox-ask";
import { upsertSession } from "@/features/sessions/data/session-store";
import { displayAttachments, prepareAttachments } from "@/features/sessions/model/attachments";
import { canSteerQueuedHead } from "@/features/sessions/model/message-queue";
import { preparePrompt } from "@/features/sessions/model/prompt-preparation";
import { deliverQueuedFollowUp } from "@/features/sessions/model/queued-follow-up";
import { canSteerHarness, steerHarnessTurn } from "@/integrations/harness";
import type { SubmissionAcceptance } from "../../../model/submission-acceptance";
import type { PreparedSubmission } from "./prepared-submission";
import type { SubmissionDeps } from "./submission-deps";
import { userTurnCards } from "./turn-blocks";

/**
 * A Familiar accepts consecutive messages before its provider is connected.
 * The pending head is delivered once ready; later messages cannot overtake it.
 */
function enqueueFamiliarFollowUp(deps: SubmissionDeps, turn: PreparedSubmission): true {
  const { sessionsRef, setSessions, dismissNoticesForContinuedSession } = deps;
  const { sessionId, text, attachments, rawCommand, noteCard, handoffCard, intent } = turn;

  const next = sessionsRef.current.map((session) =>
    session.id === sessionId
      ? enqueueFamiliarMessage(
          {
            ...session,
            inboxCard: rawCommand ? session.inboxCard : undefined,
            noteCard: rawCommand ? session.noteCard : undefined,
            handoffCard: rawCommand ? session.handoffCard : undefined,
          },
          { id: crypto.randomUUID(), text, attachments, noteCard, handoffCard, intent },
          rawCommand ? undefined : userTurnCards(noteCard),
        )
      : session,
  );
  sessionsRef.current = next;
  setSessions(next);
  dismissNoticesForContinuedSession(sessionId);
  return true;
}

/** Steers a busy Familiar's queued head into its running turn. */
function steerFamiliarQueuedHead(
  deps: SubmissionDeps,
  turn: PreparedSubmission,
  queuedMessageId: string,
): SubmissionAcceptance {
  const { sessionsRef, setSessions, turnGen, flushHarnessEvents } = deps;
  const { sessionId, current, attachments, harnessText, initialWorkCwd, rawCommand } = turn;
  const message = current.queuedMessages?.find((entry) => entry.id === queuedMessageId);
  if (
    !message ||
    !canSteerQueuedHead(current) ||
    !canSteerHarness(current.harness) ||
    turn.operatorCommand.matched
  )
    return false;

  const gen = turnGen.current.get(sessionId);
  const change = (update: (session: Session) => Session) => {
    const next = sessionsRef.current.map((session) =>
      session.id === sessionId ? update(session) : session,
    );
    sessionsRef.current = next;
    setSessions(next);
  };
  return deliverQueuedFollowUp({
    message,
    current: () => sessionsRef.current.find((session) => session.id === sessionId),
    isCurrentTurn: () => turnGen.current.get(sessionId) === gen,
    prepare: async () => {
      const latest = sessionsRef.current.find((session) => session.id === sessionId);
      if (latest) await upsertSession(latest);
      return {
        attachments: await prepareAttachments(attachments),
        text: await preparePrompt(harnessText, {
          harness: current.harness,
          sessionId,
          cwd: initialWorkCwd,
        }),
      };
    },
    steer: (prepared) =>
      steerHarnessTurn({
        harness: current.harness,
        sessionId,
        cwd: initialWorkCwd,
        model: current.model,
        modelSettings: current.modelSettings,
        text: inboxAskPrompt(rawCommand ? undefined : current.inboxAsk, prepared.text),
        attachments: prepared.attachments,
      }),
    delivered: () => {
      change((session) =>
        acknowledgeFamiliarMessage(session, message, {
          mode: "follow-up",
          text: turn.submittedText,
          attachments: displayAttachments(attachments),
          cards: userTurnCards(turn.noteCard),
        }),
      );
      flushHarnessEvents();
    },
    deferred: () => change((session) => ({ ...session, turnReady: false })),
    failed: (error) =>
      change((session) => ({
        ...session,
        queueStatus: "paused",
        queuedMessages: session.queuedMessages?.map((entry) =>
          entry.id === message.id ? { ...entry, error } : entry,
        ),
      })),
  });
}

/** Handles a message to a Familiar that is busy or has a queue; undefined otherwise. */
export function submitFamiliarFollowUp(
  deps: SubmissionDeps,
  turn: PreparedSubmission,
): SubmissionAcceptance | undefined {
  const { current, options } = turn;
  if (!turn.familiar) return undefined;

  if (!options?.queuedMessageId && (current.busy || current.queuedMessages?.length))
    return enqueueFamiliarFollowUp(deps, turn);
  if (current.busy && options?.queuedMessageId)
    return steerFamiliarQueuedHead(deps, turn, options.queuedMessageId);
  return undefined;
}
