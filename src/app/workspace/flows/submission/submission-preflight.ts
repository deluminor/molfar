import { supportsProviderAccounts } from "@/domain/harness/provider-account";
import type { Attachment } from "@/domain/session/attachment";
import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import { composeNoteMessage } from "@/features/notes/notes";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import {
  providerAccountExists,
  selectedProviderAccountId,
} from "@/features/providers/model/provider-accounts";
import { createEditedResendAttempt } from "@/features/sessions/model/edit-last-turn";
import { isPreparingHandoff, pendingComposerSwitch } from "@/features/sessions/model/handoff";
import { queuedMessageForSubmit } from "@/features/sessions/model/message-queue";
import { saveRecentModelChoice } from "@/features/sessions/model/models";
import {
  consumeOperatorCommand,
  operatorEnabledInThread,
} from "@/features/sessions/model/operator-command";
import { isNativeCommandPrompt } from "@/features/skills/model/skills";
import { withPlanBuildTarget } from "../../../model/harness-choice";
import type { PreparedSubmission } from "./prepared-submission";
import type { SubmissionDeps } from "./submission-deps";
import type { SubmitOptions } from "./submit-types";

function refuse(deps: SubmissionDeps, sessionId: string, text: string, error = false): undefined {
  deps.enqueueHarnessEvent(
    sessionId,
    error ? { type: "session.error", message: text } : { type: "status", text },
  );
  deps.flushHarnessEvents();
  return undefined;
}

/** The session the turn sees: a draft dropped, a build target and an edit applied. */
function turnSession(storedCurrent: Session, options?: SubmitOptions) {
  const draftBlock = options?.draftBlockId
    ? storedCurrent.blocks.find(
        (block) => block.id === options.draftBlockId && block.role === "user" && block.draft,
      )
    : undefined;
  if (options?.draftBlockId && !draftBlock) return undefined;

  const draftCleared = draftBlock
    ? { ...storedCurrent, blocks: storedCurrent.blocks.filter((block) => block.id !== draftBlock.id) }
    : storedCurrent;
  let current = options?.buildTarget
    ? withPlanBuildTarget(draftCleared, options.buildTarget)
    : draftCleared;
  const editedResend = options?.resendEdited
    ? createEditedResendAttempt(current, options.onResendRejected)
    : undefined;
  if (options?.resendEdited && !editedResend) return undefined;
  if (editedResend) current = { ...current, blocks: editedResend.blocks };

  return { current, draftBlock, editedResend };
}

/** Checks a submission against its session and derives the turn it starts. */
export function prepareSubmission(
  deps: SubmissionDeps,
  storedCurrent: Session,
  text: string,
  attachments: Attachment[],
  options?: SubmitOptions,
): PreparedSubmission | undefined {
  const sessionId = storedCurrent.id;
  const turn = turnSession(storedCurrent, options);
  if (!turn) return undefined;
  const { current, draftBlock, editedResend } = turn;

  const intent = options?.intent ?? "default";
  if (intent === "orchestrate") {
    try {
      const run = orchestrator.forSession(sessionId);
      if (run && ["active", "paused"].includes(run.status))
        throw new Error("Stop the current orchestration run before preparing another proposal.");
    } catch (error) {
      return refuse(deps, sessionId, error instanceof Error ? error.message : String(error));
    }
  }
  const approvedPlan = options?.planBlockId
    ? current.blocks.find((block) => block.id === options.planBlockId && block.role === "plan")
    : undefined;
  if (intent === "build" && !approvedPlan?.text.trim()) return undefined;
  if (options?.queuedMessageId) {
    const mode = options.followUpBehavior === "steer" ? "steer" : "dispatch";
    if (!queuedMessageForSubmit(current, options.queuedMessageId, mode)) return undefined;
  }

  const noteCard = options && "noteCard" in options ? options.noteCard : current.noteCard;
  const handoffCard = options && "handoffCard" in options ? options.handoffCard : current.handoffCard;
  if (!text.trim() && attachments.length === 0 && !noteCard && !handoffCard) return undefined;
  if (isPreparingHandoff(current)) return undefined;

  saveRecentModelChoice(current.harness, current.model);
  const accountProvider = supportsProviderAccounts(current.harness) ? current.harness : undefined;
  const providerAccountId = accountProvider
    ? (current.providerAccountId ?? selectedProviderAccountId(accountProvider, current.cwd))
    : undefined;
  if (accountProvider && providerAccountId && !providerAccountExists(accountProvider, providerAccountId))
    return refuse(
      deps,
      sessionId,
      "This conversation uses a removed provider account. Switch accounts from the usage control to start a new conversation.",
      true,
    );

  const submittedText = intent === "build" ? "Build approved plan" : text;
  const operatorCommand = consumeOperatorCommand(submittedText);
  if (
    operatorCommand.matched &&
    (intent !== "default" || current.orchestrationLeadId || current.inboxAsk || orchestrator.run(sessionId))
  )
    return refuse(deps, sessionId, "Use /operator from a regular session turn, outside an orchestration run.");

  // The Familiar has app access in every turn, without the command.
  const familiar = isFamiliarSession(sessionId);
  const promptText = operatorCommand.matched
    ? operatorCommand.text.trim() || "Explain what you can do in MOLFAR with the app CLI."
    : submittedText;
  const rawCommand = !operatorCommand.matched && isNativeCommandPrompt(submittedText, current.harness);

  return {
    sessionId,
    text,
    attachments,
    options,
    current,
    draftBlock,
    editedResend,
    editedProviderTurnId: editedResend?.providerTurnId,
    intent,
    approvedPlan,
    noteCard,
    handoffCard,
    initialWorkCwd: sessionWorkCwd(current),
    createDraftWorktree: !current.worktreeCwd && current.workspaceMode === "worktree",
    providerAccountId,
    submittedText,
    operatorCommand,
    familiar,
    queuedFamiliarMessage:
      familiar && options?.queuedMessageId
        ? current.queuedMessages?.find((message) => message.id === options.queuedMessageId)
        : undefined,
    operatorAccess: operatorCommand.matched || familiar || operatorEnabledInThread(current.blocks),
    familiarFirstTurn: familiar && !current.blocks.some((block) => block.role === "user" && !block.draft),
    promptText,
    rawCommand,
    ciContext: options?.ciRepair?.prompt ?? options?.ciContext,
    harnessText:
      options?.ciRepair?.prompt ?? (rawCommand ? submittedText : composeNoteMessage(noteCard, promptText)),
    pendingSwitch: pendingComposerSwitch(current),
  };
}
