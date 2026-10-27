import type { Session } from "@/domain/session/session";
import { inboxAskPrompt } from "@/features/inbox/model/inbox-ask";
import { displayAttachments, prepareAttachments } from "@/features/sessions/model/attachments";
import { dequeueQueuedMessage } from "@/features/sessions/model/message-queue";
import { preparePrompt } from "@/features/sessions/model/prompt-preparation";
import { type FollowUpBehavior, loadFollowUpBehavior } from "@/features/settings/model/settings";
import {
  appendSteerUser,
  canSteerHarness,
  isLiveHarness,
  steerHarnessTurn,
} from "@/integrations/harness";
import type { SubmissionAcceptance } from "../../../model/submission-acceptance";
import type { PreparedSubmission } from "./prepared-submission";
import type { SubmissionDeps } from "./submission-deps";
import { userTurnCards } from "./turn-blocks";

function followUpBehavior(turn: PreparedSubmission, steerable: boolean): FollowUpBehavior {
  const { current, intent } = turn;
  if (
    current.worktreePreparing ||
    intent === "plan" ||
    intent === "orchestrate" ||
    turn.operatorCommand.matched
  )
    return "queue";
  // The agent has yielded and only background work is left, which may never
  // end (a dev server). Queuing would park the message behind it, so hand it
  // to the agent now.
  if (current.backgroundTasks?.length) return "steer";
  // Messaging a Familiar mid-reply is like texting a friend twice: it reads
  // the new message now, or right after if it can't.
  if (turn.familiar) return steerable ? "steer" : "queue";
  return turn.options?.followUpBehavior ?? loadFollowUpBehavior();
}

function queueFollowUp(deps: SubmissionDeps, turn: PreparedSubmission): true {
  const { sessionId, text, attachments, rawCommand, noteCard, handoffCard, intent, options } = turn;
  deps.setSessions((prev) =>
    prev.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            inboxCard: rawCommand ? s.inboxCard : undefined,
            noteCard: rawCommand ? s.noteCard : undefined,
            handoffCard: rawCommand ? s.handoffCard : undefined,
            queuedMessages: [
              ...(s.queuedMessages ?? []),
              {
                // An app request's ID, so a retried request finds it queued.
                id: options?.appRequestId ?? crypto.randomUUID(),
                text,
                attachments,
                noteCard,
                handoffCard,
                intent,
              },
            ],
            queueStatus: s.queueStatus === "paused" ? "paused" : "active",
          }
        : s,
    ),
  );
  deps.dismissNoticesForContinuedSession(sessionId);
  return true;
}

function steerFollowUp(deps: SubmissionDeps, turn: PreparedSubmission): true {
  const { sessionsRef, setSessions, enqueueHarnessEvent, flushHarnessEvents } = deps;
  const { sessionId, current, attachments, options, rawCommand, harnessText, initialWorkCwd } = turn;
  deps.dismissNoticesForContinuedSession(sessionId);

  const visible = displayAttachments(attachments);
  const cards = userTurnCards(turn.noteCard);
  const nextSessions = sessionsRef.current.map((s) => {
    if (s.id !== sessionId) return s;
    let next: Session = {
      ...s,
      inboxCard: rawCommand ? s.inboxCard : undefined,
      noteCard: rawCommand ? s.noteCard : undefined,
      handoffCard: rawCommand ? s.handoffCard : undefined,
    };
    if (options?.queuedMessageId) next = dequeueQueuedMessage(next, options.queuedMessageId);
    return appendSteerUser(next, turn.submittedText, visible, {
      ...cards,
      ...(options?.appRequestId ? { appRequestId: options.appRequestId } : {}),
    });
  });
  sessionsRef.current = nextSessions;
  setSessions(nextSessions);

  void (async () => {
    try {
      const prepared = await prepareAttachments(attachments);
      const prompt = await preparePrompt(harnessText, {
        harness: current.harness,
        sessionId,
        cwd: initialWorkCwd,
      });
      await steerHarnessTurn({
        harness: current.harness,
        sessionId,
        cwd: initialWorkCwd,
        model: current.model,
        modelSettings: current.modelSettings,
        text: inboxAskPrompt(rawCommand ? undefined : current.inboxAsk, prompt),
        attachments: prepared,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : `${current.harness} could not steer the active turn`;
      enqueueHarnessEvent(sessionId, { type: "session.error", message });
      flushHarnessEvents();
    }
  })();
  return true;
}

/** A message to a running session steers it or waits in its queue; undefined when idle. */
export function submitBusyFollowUp(
  deps: SubmissionDeps,
  turn: PreparedSubmission,
): SubmissionAcceptance | undefined {
  const { sessionId, current, options } = turn;
  if (!current.busy || turn.pendingSwitch) return undefined;

  const refuse = (text: string): false => {
    deps.enqueueHarnessEvent(sessionId, { type: "status", text });
    deps.flushHarnessEvents();
    return false;
  };
  if (
    turn.operatorCommand.matched &&
    options?.queuedMessageId &&
    options.followUpBehavior === "steer"
  )
    return refuse("/operator starts a new turn after the current turn finishes.");

  const steerable = isLiveHarness(current.harness) && canSteerHarness(current.harness);
  if (followUpBehavior(turn, steerable) === "queue") return queueFollowUp(deps, turn);
  // Harnesses that cannot steer (fx) used to drop the message on the floor
  // here, so a follow-up sent mid-turn just vanished. Say so.
  if (!steerable)
    return refuse(
      `${current.harness} cannot take a follow-up mid-turn — wait for this turn to finish, or stop it first.`,
    );
  return steerFollowUp(deps, turn);
}
