import type { HarnessId } from "@/domain/harness/harness";
import type { OrchestrationProposal } from "@/domain/orchestration/proposal";
import type { Session } from "@/domain/session/session";
import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import type { PreparedSubmission } from "./prepared-submission";
import type { SubmissionDeps } from "./submission-deps";
import type { TurnSetup } from "./turn-setup";

export type HandoffWrap = { from: HarnessId; to: HarnessId; text: string };

/** What a running turn learns and changes while it runs. */
export type TurnRun = {
  /** The session as sent; a Familiar's rotation drops its provider session. */
  current: Session;
  workCwd: string;
  proposalDraft?: OrchestrationProposal;
  completedProposal?: OrchestrationProposal;
  /** The recap a handoff hands the new harness, sent with this turn. */
  wrap: HandoffWrap | null;
  controlOutcome: ControlOutcome;
  /** The reply as the orchestrator or app request reads it. */
  controlText: string;
  proposalText: string;
  nativeProposalText: string;
  nativePlanSeen: boolean;
  providerFailureSeen: boolean;
  buildSucceeded: boolean;
};

export type TurnContext = {
  deps: SubmissionDeps;
  turn: PreparedSubmission;
  setup: TurnSetup;
  run: TurnRun;
  /** False once the user stopped this turn or started another. */
  isCurrent(): boolean;
  /** Writes the submitted user message (deferred for an edited resend). */
  commitSubmittedTurn(): void;
};

export function startTurnRun(turn: PreparedSubmission, setup: TurnSetup): TurnRun {
  const { handoffCard, current } = turn;
  return {
    current,
    workCwd: turn.initialWorkCwd,
    proposalDraft: setup.proposalDraft,
    wrap: handoffCard
      ? { from: handoffCard.from, to: current.harness, text: handoffCard.brief }
      : setup.queuedHandoff,
    controlOutcome: { status: "failed", text: "", error: "Turn did not complete" },
    controlText: "",
    proposalText: "",
    nativeProposalText: "",
    nativePlanSeen: false,
    providerFailureSeen: false,
    buildSucceeded: false,
  };
}
