import { flushSync } from "react-dom";
import type { Attachment } from "@/domain/session/attachment";
import { remoteProjectFor } from "@/features/connections/model/remote-projects";
import { remoteSessionActions } from "@/features/connections/model/remote-session-actions";
import { syncDockBadge } from "@/features/notifications/model/dock-badge";
import { proposalBlock } from "@/features/orchestration/model/orchestration-plan";
import {
  canRewindHarnessLastTurn,
  cancelHarnessTurn,
  forgetHarnessSession,
} from "@/integrations/harness";
import type { SubmissionAcceptance } from "../../../model/submission-acceptance";
import { submitBusyFollowUp } from "./busy-follow-up";
import { submitFamiliarFollowUp } from "./familiar-follow-up";
import type { PreparedSubmission } from "./prepared-submission";
import { submitAfterProjectLocation } from "./project-sync";
import { runTurn } from "./run-turn";
import type { SubmissionDeps } from "./submission-deps";
import { submittableSession } from "./submission-guards";
import { prepareSubmission } from "./submission-preflight";
import type { SubmitOptions } from "./submit-types";
import { submittedSession } from "./submitted-session";
import { startTurnRun, type TurnContext } from "./turn-run";
import { setUpTurn } from "./turn-setup";

/** The harness is not connected: the turn ends at once with a notice. */
function settleOffline(turn: PreparedSubmission): true {
  const { pendingSwitch, sessionId, editedResend, options } = turn;
  if (pendingSwitch) void forgetHarnessSession(pendingSwitch.from, sessionId);
  editedResend?.reject();
  options?.onSettled?.({ status: "failed", text: "", error: "Harness is not connected" });
  return true;
}

/** An edited resend holds the session busy while the provider rewinds its last turn. */
function lockForRewind({ deps, turn }: TurnContext): void {
  const { sessionsRef, setSessions, editedResends } = deps;
  const { sessionId, editedResend, current } = turn;
  if (!editedResend || !canRewindHarnessLastTurn(current.harness)) return;

  editedResends.start(sessionId);
  const locked = sessionsRef.current.map((session) =>
    session.id === sessionId ? { ...session, busy: true } : session,
  );
  sessionsRef.current = locked;
  syncDockBadge(locked);
  setSessions(locked);
}

function showProposalDraft({ deps, turn, setup }: TurnContext): void {
  const { proposalId, proposalDraft } = setup;
  if (!proposalId || !proposalDraft) return;
  deps.setSessions((prev) =>
    prev.map((session) =>
      session.id === turn.sessionId
        ? { ...session, blocks: [...session.blocks, proposalBlock(proposalId, proposalDraft)] }
        : session,
    ),
  );
}

/** Starts a new turn: writes the user's message and runs the harness in the background. */
function startTurn(deps: SubmissionDeps, turn: PreparedSubmission): SubmissionAcceptance {
  const { sessionId, options, pendingSwitch, current } = turn;
  const gen = (deps.turnGen.current.get(sessionId) ?? 0) + 1;
  deps.turnGen.current.set(sessionId, gen);
  const setup = setUpTurn(turn, gen);
  if (pendingSwitch && current.busy) void cancelHarnessTurn(pendingSwitch.from, sessionId);

  deps.dismissNoticesForContinuedSession(sessionId);
  const commitSubmittedTurn = () => {
    deps.setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? submittedSession(s, turn, setup) : s)),
    );
  };
  if (!options?.resendEdited) flushSync(commitSubmittedTurn);

  const context: TurnContext = {
    deps,
    turn,
    setup,
    run: startTurnRun(turn, setup),
    isCurrent: () => deps.turnGen.current.get(sessionId) === gen,
    commitSubmittedTurn,
  };
  if (!setup.live) return settleOffline(turn);
  lockForRewind(context);
  showProposalDraft(context);
  runTurn(context);
  return true;
}

/**
 * Sends a message to a session: as a new turn, a steer or queued follow-up
 * of the running one, or through a remote project's host.
 */
export function submitSession(
  deps: SubmissionDeps,
  sessionId: string,
  text: string,
  attachments: Attachment[] = [],
  options?: SubmitOptions,
): SubmissionAcceptance {
  const remote = deps.sessionsRef.current.find((session) => session.id === sessionId);
  if (remote && remoteProjectFor(remote.cwd))
    return !!remoteSessionActions(sessionId)?.submit(text, attachments, options);

  const storedCurrent = submittableSession(deps, sessionId, options);
  const turn = storedCurrent && prepareSubmission(deps, storedCurrent, text, attachments, options);
  if (!turn) return false;

  return (
    submitFamiliarFollowUp(deps, turn) ??
    submitBusyFollowUp(deps, turn) ??
    submitAfterProjectLocation(deps, turn) ??
    startTurn(deps, turn)
  );
}
