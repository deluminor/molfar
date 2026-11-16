import { HARNESS_LABEL } from "@/domain/harness/harness";
import type { OrchestrationProposal } from "@/domain/orchestration/proposal";
import { canReplaceSessionTitle, titleFromPrompt } from "@/domain/session/title";
import {
  loadFamiliarRotation,
  planRotation,
  rotationReason,
} from "@/features/familiars/model/familiar-rotation";
import { displayAttachments } from "@/features/sessions/model/attachments";
import { handoffTurnCard, pendingHandoff } from "@/features/sessions/model/handoff";
import { SECOND_OPINION_TITLE } from "@/features/sessions/model/second-opinion";
import { isLiveHarness } from "@/integrations/harness";
import { resolveModel } from "@/integrations/harness/core/models/resolve-model";
import type { PreparedSubmission } from "./prepared-submission";
import { userTurnCards } from "./turn-blocks";

/** A Familiar's provider session fills up: this turn starts a fresh one, briefed. */
function familiarRotationFor(turn: PreparedSubmission) {
  const { familiar, pendingSwitch, editedResend, current, sessionId } = turn;
  // A Familiar's chat never ends, but the provider session behind it does:
  // once it fills most of the model's context window, this turn starts
  // a fresh one, briefed on where the conversation was.
  const reason = familiar && !pendingSwitch && !editedResend ? rotationReason(current) : undefined;
  return reason
    ? planRotation(current.blocks, loadFamiliarRotation(sessionId), reason, Date.now())
    : undefined;
}

function orchestrationDraft(
  turn: PreparedSubmission,
  proposalId: string | undefined,
): OrchestrationProposal | undefined {
  const { current, sessionId } = turn;
  if (!proposalId) return undefined;

  return {
    version: 1,
    leadId: sessionId,
    cwd: current.cwd,
    checkoutCwd: turn.initialWorkCwd,
    request: turn.harnessText,
    author: {
      harness: current.harness,
      model: current.model,
      name: resolveModel(current.harness, current.model).name,
    },
    settings: { choices: [], maxWorkers: 2 },
    status: "planning",
    title: "Orchestration plan",
    summary: "",
    tasks: [],
  };
}

function visibleTurnText(turn: PreparedSubmission, card: ReturnType<typeof turnCard>): string {
  if (turn.operatorCommand.matched) return turn.promptText;
  if (card?.kind === "handoff") return turn.submittedText;
  return card ? SECOND_OPINION_TITLE : turn.submittedText;
}

function turnCard(turn: PreparedSubmission) {
  return turn.options?.secondOpinion ?? (turn.handoffCard ? handoffTurnCard(turn.handoffCard) : undefined);
}

/** What a new turn shows and starts with, worked out before anything is written. */
export function setUpTurn(turn: PreparedSubmission, gen: number) {
  const { current, options, intent, attachments, rawCommand, ciContext } = turn;
  const proposalId = intent === "orchestrate" ? crypto.randomUUID() : undefined;
  const isFirstTurn = current.blocks.length === 0;
  const placeholderTitle =
    canReplaceSessionTitle(current.title, current.harness, HARNESS_LABEL[current.harness]) ||
    !!turn.draftBlock;
  const titleSeed =
    isFirstTurn && !current.inboxCard && !current.noteCard && placeholderTitle
      ? titleFromPrompt(
          turn.operatorCommand.matched ? turn.promptText : turn.submittedText,
          current.harness,
          attachments,
        )
      : current.title;
  const card = turnCard(turn);
  const live = isLiveHarness(current.harness);

  return {
    gen,
    familiarRotation: familiarRotationFor(turn),
    proposalId,
    proposalDraft: orchestrationDraft(turn, proposalId),
    isFirstTurn,
    placeholderTitle,
    titleSeed,
    visible: displayAttachments(attachments),
    visibleText: visibleTurnText(turn, card),
    cards: {
      ...(rawCommand ? undefined : userTurnCards(turn.noteCard, card)),
      ...(ciContext ? { ciContext } : {}),
      ...(turn.operatorCommand.matched ? { molfar: true } : {}),
      ...(intent === "plan" || intent === "orchestrate" ? { intent } : {}),
      ...(options?.appRequestId ? { appRequestId: options.appRequestId } : {}),
      // The orchestrator writes these turns, not the user; hide them.
      ...(options?.managed || options?.familiarSessionCompletion ? { internal: true } : {}),
      ...(options?.familiarSessionCompletion
        ? { familiarSessionCompletion: options.familiarSessionCompletion }
        : {}),
    },
    live,
    queuedHandoff: live && !turn.pendingSwitch ? pendingHandoff(current) : null,
  };
}

export type TurnSetup = ReturnType<typeof setUpTurn>;
