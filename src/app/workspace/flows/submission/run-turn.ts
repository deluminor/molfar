import { isProviderFailureText } from "@/domain/session/plan";
import type { Attachment } from "@/domain/session/attachment";
import { recordAgentContext } from "@/features/familiars/model/familiar-files";
import { discoverOrchestrationSettings } from "@/features/orchestration/model/orchestration-catalog";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import {
  completeOrRepairOrchestrationProposal,
  withOrchestrationProposal,
} from "@/features/orchestration/model/orchestration-plan";
import { prepareAttachments } from "@/features/sessions/model/attachments";
import { beginSessionTurn, finishSessionTurn } from "@/features/sessions/model/checkpoint";
import { sessionEditPaths } from "@/features/sessions/model/checkpoint-edits";
import { completeHandoff, consumeHandoff, isPreparingHandoff } from "@/features/sessions/model/handoff";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import { sendHarnessTurn, stopHarnessSession } from "@/integrations/harness";
import { withAppContext } from "./familiar-turn-context";
import { createTurnEvents, type TurnEvents } from "./turn-events";
import { failTurn, finishTurn } from "./turn-finish";
import { revealHandoff, takeOverFromOutgoingHarness } from "./turn-handoff";
import { harnessTurnText, intentPrompt } from "./turn-prompt";
import { rewindEditedTurn } from "./turn-rewind";
import type { TurnContext } from "./turn-run";
import { prepareDraftWorktree } from "./turn-worktree";
import { launchTitleGeneration } from "./title-generation";

/** Loads the orchestration settings a proposal is planned against. */
async function discoverProposalSettings(context: TurnContext): Promise<void> {
  const { deps, turn, setup, run } = context;
  const { proposalId } = setup;
  if (!run.proposalDraft || !proposalId) return;

  const settings = await discoverOrchestrationSettings();
  if (!context.isCurrent()) return;
  run.proposalDraft = { ...run.proposalDraft, settings };
  const discovering = run.proposalDraft;
  deps.setSessions((prev) =>
    prev.map((session) =>
      session.id === turn.sessionId
        ? withOrchestrationProposal(session, proposalId, discovering)
        : session,
    ),
  );
}

function harnessSender(context: TurnContext, events: TurnEvents, prepared: Attachment[]) {
  const { turn, run } = context;
  const { sessionId, intent, operatorAccess, editedResend } = turn;
  return (text: string, turnAttachments = prepared) =>
    sendHarnessTurn({
      harness: run.current.harness,
      sessionId,
      cwd: run.workCwd,
      model: run.current.model,
      modelSettings: run.current.modelSettings,
      providerAccountId: turn.providerAccountId,
      runtimeMode: run.current.runtimeMode,
      ephemeral: run.current.ephemeral === true,
      codexStore: isFamiliarSession(sessionId) ? "mono" : undefined,
      intent: intent === "orchestrate" ? "plan" : intent,
      // A /operator user turn enables app access for this thread;
      // orchestration leads retain their separate control access.
      controlsAgents: operatorAccess || orchestrator.run(sessionId)?.status === "active",
      appAccess: operatorAccess,
      text,
      attachments: turnAttachments,
      ...(editedResend ? { onAccepted: events.acceptEditedResend } : {}),
      onEvent: events.routeTurnEvent,
    });
}

/** Sends the turn; true once the harness finished it, false when it was superseded. */
async function sendTurn(context: TurnContext, events: TurnEvents): Promise<boolean> {
  const { deps, turn, run } = context;
  const { sessionId } = turn;
  const prepared = await prepareAttachments(turn.attachments);
  const prompt = await intentPrompt(context);
  if (!(await rewindEditedTurn(context, events))) return false;

  const send = harnessSender(context, events, prepared);
  const { text, agentFiles, handedFiles } = await withAppContext(context, harnessTurnText(context, prompt));
  await send(text);
  if (agentFiles) {
    recordAgentContext(
      sessionId,
      deps.sessionsRef.current.find((session) => session.id === sessionId)?.providerSessionId ??
        run.current.providerSessionId,
      handedFiles ?? agentFiles,
    );
  }
  events.acceptEditedResend();

  const draft = run.proposalDraft;
  if (draft && !run.providerFailureSeen) {
    run.completedProposal = await completeOrRepairOrchestrationProposal(
      draft,
      run.nativeProposalText || run.proposalText,
      async (repairPrompt) => {
        run.proposalText = "";
        run.nativeProposalText = "";
        await send(repairPrompt, []);
        if (run.providerFailureSeen)
          throw new Error(run.controlOutcome.error ?? "The lead could not repair the proposal.");
        return run.nativeProposalText || run.proposalText;
      },
      () => context.isCurrent() && !isProviderFailureText(run.nativeProposalText || run.proposalText),
    );
  }
  return context.isCurrent();
}

/** The handoff recap was delivered with this turn; a later turn must not resend it. */
function consumeDeliveredHandoff({ deps, turn, run }: TurnContext): void {
  const { wrap } = run;
  if (!wrap) return;
  // Settle the ref too: the flush in `finally` rebuilds sessions from
  // it, and a stale ref would drop the consumed flag and resend the
  // recap with every later turn.
  deps.sessionsRef.current = deps.sessionsRef.current.map((s) => {
    if (s.id !== turn.sessionId) return s;
    const ready = isPreparingHandoff(s) ? completeHandoff(s, wrap.text) : s;
    // A command owns its arguments; deliver the recap with the next chat prompt.
    return turn.rawCommand ? ready : consumeHandoff(ready);
  });
  deps.setSessions(deps.sessionsRef.current);
}

function recordFailure(context: TurnContext, events: TurnEvents, error: unknown): void {
  const { deps, turn, run } = context;
  events.recoverEditedResend();
  if (!context.isCurrent()) return;
  if (run.wrap) revealHandoff(context, run.wrap.text);

  const message =
    error instanceof Error ? error.message : String(error) || `${turn.current.harness} adapter failed`;
  run.controlOutcome.error = message;
  if (!run.providerFailureSeen) {
    deps.enqueueHarnessEvent(turn.sessionId, { type: "session.error", message });
  }
  run.providerFailureSeen = true;
}

async function runTurnBody(context: TurnContext): Promise<void> {
  const { turn, run } = context;
  const { sessionId, current } = turn;
  if (turn.createDraftWorktree) await prepareDraftWorktree(context);
  launchTitleGeneration(context.deps, turn, context.setup, run.workCwd);
  if (!context.isCurrent()) return;
  await discoverProposalSettings(context);
  if (!context.isCurrent()) return;
  if (!(await takeOverFromOutgoingHarness(context))) return;

  const events = createTurnEvents(context);
  const checkpointTurnId =
    !current.inboxAsk && !orchestrator.forSession(sessionId)
      ? await beginSessionTurn(sessionId, run.workCwd, sessionEditPaths(current.blocks))
      : undefined;
  if (!context.isCurrent()) {
    if (checkpointTurnId) await finishSessionTurn(sessionId, run.workCwd, { turnId: checkpointTurnId });
    return;
  }

  try {
    if (!(await sendTurn(context, events))) return;
    consumeDeliveredHandoff(context);
    run.buildSucceeded = true;
  } catch (error: unknown) {
    recordFailure(context, events, error);
  } finally {
    // A failed provider can leave its process writing after the event
    // stream ends. Stop it before recording the final workspace state.
    if (run.providerFailureSeen && context.isCurrent()) {
      await stopHarnessSession(current.harness, sessionId).catch(() => undefined);
    }
    if (checkpointTurnId) {
      await finishSessionTurn(sessionId, run.workCwd, { turnId: checkpointTurnId });
    }
    if (context.isCurrent()) await finishTurn(context, events.planEventKey);
  }
}

/** Runs the turn in the background and settles its control outcome when done. */
export function runTurn(context: TurnContext): void {
  const { deps, turn, run } = context;
  const { sessionId, editedResend, options } = turn;
  void runTurnBody(context)
    .catch((error: unknown) => failTurn(context, error))
    .finally(() => {
      editedResend?.reject();
      if (editedResend) deps.editedResends.finish(sessionId);
      options?.onSettled?.(
        context.isCurrent() ? run.controlOutcome : { status: "cancelled", text: run.controlText },
      );
    });
}
