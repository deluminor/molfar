import { isProviderFailureText } from "@/domain/session/plan";
import type { Session } from "@/domain/session/session";
import { isHabitRun } from "@/features/familiars/model/familiar-habits";
import { nudgeWatchedFiles } from "@/features/files/model/file-watch";
import { announceSessionFinished } from "@/features/notifications/model/notifications";
import {
  completeOrchestrationProposal,
  withOrchestrationProposal,
} from "@/features/orchestration/model/orchestration-plan";
import { flushSessionCheckpoint, notifyReviewChanged } from "@/features/sessions/model/checkpoint";
import {
  detachSessionWorktree,
  worktreeDeletedExternally,
} from "@/features/source-control/model/worktrees";
import { promoteLastAssistantToPlan, stopStreaming } from "@/integrations/harness";
import { notifyGitChanged } from "@/platform/tauri/fs";
import { nudgeWorkspace } from "../../../model/nudge-workspace";
import { lastAssistantTextInTurn, withPlanStatus } from "./turn-blocks";
import type { TurnContext } from "./turn-run";

/** The session once its turn ended: plan promoted or built, proposal settled. */
function finishedSession(context: TurnContext, s: Session, planEventKey: string): Session {
  const { turn, setup, run } = context;
  const { approvedPlan, intent } = turn;
  const stopped = stopStreaming(s);
  const providerFailed =
    run.providerFailureSeen || isProviderFailureText(lastAssistantTextInTurn(stopped));

  let finalized = stopped;
  if (run.proposalDraft && setup.proposalId) {
    finalized = withOrchestrationProposal(
      stopped,
      setup.proposalId,
      run.completedProposal && !providerFailed && run.buildSucceeded
        ? run.completedProposal
        : completeOrchestrationProposal(
            run.proposalDraft,
            run.nativeProposalText || run.proposalText,
            providerFailed || !run.buildSucceeded
              ? (run.controlOutcome.error ?? "The lead could not finish planning.")
              : undefined,
          ),
    );
  } else if (intent === "plan" && !run.nativePlanSeen && !providerFailed) {
    finalized = promoteLastAssistantToPlan(stopped, planEventKey);
  }

  return approvedPlan && intent === "build"
    ? withPlanStatus(
        finalized,
        approvedPlan.id,
        run.buildSucceeded && !providerFailed ? "built" : "ready",
      )
    : finalized;
}

/**
 * A worktree removed outside the app fails every turn. Detaches the session
 * as an in-app removal would, so it can pick a new checkout.
 */
function detachIfWorktreeGone({ deps, turn, run }: TurnContext): void {
  const { sessionId } = turn;
  const worktreePath = turn.current.worktreeCwd;
  if (!run.providerFailureSeen || !worktreePath) return;

  void worktreeDeletedExternally(worktreePath)
    .then((deleted) => {
      if (!deleted || deps.switchingWorktrees.current.has(sessionId)) return;
      // Through the ref too, or a pending event flush puts it back.
      deps.sessionsRef.current = deps.sessionsRef.current.map((s) =>
        s.id === sessionId && !s.busy && !s.worktreeRemoved && s.worktreeCwd === worktreePath
          ? detachSessionWorktree(s, s.cwd, worktreePath)
          : s,
      );
      deps.setSessions(deps.sessionsRef.current);
    })
    .catch(() => undefined);
}

/** Settles the session after its turn, announces it and refreshes what it may have changed. */
export async function finishTurn(context: TurnContext, planEventKey: string): Promise<void> {
  const { deps, turn, run } = context;
  const { sessionId } = turn;
  deps.flushHarnessEvents();
  run.controlOutcome = {
    status:
      run.providerFailureSeen || isProviderFailureText(run.controlText) || !run.buildSucceeded
        ? "failed"
        : "completed",
    text: run.controlText.trim(),
    ...(run.providerFailureSeen ? { error: run.controlOutcome.error } : {}),
  };
  await flushSessionCheckpoint(sessionId);
  deps.setSessions((prev) =>
    prev.map((s) => (s.id === sessionId ? finishedSession(context, s, planEventKey) : s)),
  );
  detachIfWorktreeGone(context);

  // Next tick: the flush above has rendered by then, so the banner
  // quotes the reply's final text rather than the previous batch.
  window.setTimeout(() => {
    const finished = deps.sessionsRef.current.find((s) => s.id === sessionId);
    const visible = sessionId === deps.activeSessionIdRef.current;
    // A habit's hidden run speaks through its Familiar's chat, and a
    // Task Board stage through the board, instead.
    if (finished && !isHabitRun(sessionId) && !finished.taskCardId)
      void announceSessionFinished(finished, visible);
  }, 0);
  notifyReviewChanged(sessionId);
  notifyGitChanged();
  nudgeWorkspace(run.workCwd);
  nudgeWatchedFiles();
  window.setTimeout(() => nudgeWatchedFiles(), 150);
}

/** A failure outside the provider's own (worktree creation, preparation): stops the turn. */
export function failTurn(context: TurnContext, error: unknown): void {
  const { deps, turn, setup, run } = context;
  const { sessionId } = turn;
  const message = error instanceof Error ? error.message : String(error);
  run.controlOutcome = { status: "failed", text: run.controlText, error: message };
  if (!context.isCurrent()) return;

  deps.enqueueHarnessEvent(sessionId, { type: "session.error", message });
  deps.flushHarnessEvents();
  deps.setSessions((prev) =>
    prev.map((session) => {
      if (session.id !== sessionId) return session;
      const stopped = { ...stopStreaming(session), worktreePreparing: undefined };
      return setup.proposalId && run.proposalDraft
        ? withOrchestrationProposal(
            stopped,
            setup.proposalId,
            completeOrchestrationProposal(run.proposalDraft, "", message),
          )
        : stopped;
    }),
  );
}
