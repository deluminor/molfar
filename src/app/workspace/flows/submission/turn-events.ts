import { flushSync } from "react-dom";
import { planTurnKey } from "@/domain/session/plan";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import type { HarnessEvent } from "@/integrations/harness";
import { revealHandoff } from "./turn-handoff";
import { nudgeOpenEditors, trackSessionEdits } from "./turn-file-effects";
import type { TurnContext } from "./turn-run";

/**
 * Keeps an orchestration proposal's text out of the transcript, and keys a
 * plan turn's native plan to this turn.
 */
function routePlanEvent(context: TurnContext, planEventKey: string, event: HarnessEvent) {
  const { run } = context;
  if (event.type === "session.error") run.providerFailureSeen = true;
  if (run.proposalDraft) {
    if (event.type === "message.delta") {
      run.proposalText = (run.proposalText + event.text).slice(-200_000);
      return null;
    }
    if (event.type === "message.completed") {
      run.proposalText += "\n";
      return null;
    }
    if (event.type === "plan") {
      run.nativeProposalText = event.append ? run.nativeProposalText + event.text : event.text;
      return null;
    }
  }
  if (context.turn.intent !== "plan") return event;
  if (event.type === "plan") {
    run.nativePlanSeen = true;
    return { ...event, key: planEventKey };
  }
  return event;
}

/** Routes the running turn's events into its session, holding them until an edit is accepted. */
export function createTurnEvents(context: TurnContext) {
  const { deps, turn, run } = context;
  const { sessionId, options, editedResend } = turn;
  const planEventKey = planTurnKey(context.setup.gen);
  const pendingEditedEvents: HarnessEvent[] = [];

  const applyTurnEvent = (event: HarnessEvent) => {
    orchestrator.observe(sessionId, event);
    if (options?.onSettled && event.type === "message.delta")
      run.controlText = (run.controlText + event.text).slice(-20_000);
    if (options?.onSettled && event.type === "message.completed") run.controlText += "\n";
    if (event.type === "session.error") run.controlOutcome.error = event.message;
    if (run.wrap && (event.type === "session.started" || event.type === "session.providerBound")) {
      revealHandoff(context, run.wrap.text);
    }
    nudgeOpenEditors(event, run.workCwd);
    if (!orchestrator.forSession(sessionId)) trackSessionEdits(sessionId, run.workCwd, event);
    const routed = routePlanEvent(context, planEventKey, event);
    if (routed) deps.enqueueHarnessEvent(sessionId, routed);
  };

  const routeTurnEvent = (event: HarnessEvent) => {
    if (!context.isCurrent()) return;
    if (editedResend && !editedResend.isAccepted()) {
      pendingEditedEvents.push(event);
      return;
    }
    applyTurnEvent(event);
  };

  const acceptEditedResend = () => {
    if (!editedResend || editedResend.isAccepted()) return;
    flushSync(context.commitSubmittedTurn);
    editedResend.markAccepted();
    for (const event of pendingEditedEvents) applyTurnEvent(event);
    pendingEditedEvents.length = 0;
  };

  const recoverEditedResend = () => {
    if (!editedResend || editedResend.isAccepted()) return;
    pendingEditedEvents.length = 0;
    const previous = deps.sessionsRef.current.find((session) => session.id === sessionId);
    const recovered = previous ? editedResend.recoverAfterFailure(previous) : undefined;
    flushSync(() => {
      deps.setSessions((prev) =>
        prev.map((session) => (session.id === sessionId && recovered ? recovered : session)),
      );
    });
  };

  return { planEventKey, routeTurnEvent, acceptEditedResend, recoverEditedResend };
}

export type TurnEvents = ReturnType<typeof createTurnEvents>;
