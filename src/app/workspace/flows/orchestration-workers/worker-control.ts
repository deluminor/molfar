import { invoke } from "@tauri-apps/api/core";
import { sessionWorkCwd } from "@/domain/session/session-state";
import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import { sessionChildHarnesses } from "@/features/sessions/model/handoff";
import {
  type ApprovalDecision,
  appendSteerUser,
  canSteerHarness,
  isLiveHarness,
  respondHarnessApproval,
  respondHarnessQuestion,
  steerHarnessTurn,
  stopHarnessSession,
  type UserQuestionReply,
} from "@/integrations/harness";
import { flushSync } from "react-dom";
import { submitWithSettlement } from "../../../model/managed-submission";
import type { SubmissionAcceptance } from "../../../model/submission-acceptance";
import { commitSessions, findSession, type WorkerDeps } from "./worker-deps";

/** Sends a worker a turn on the lead's behalf; `done` hears how it ended. */
export function submitToWorker(
  deps: WorkerDeps,
  id: string,
  text: string,
  done: (outcome: ControlOutcome) => void,
): void {
  void submitWithSettlement({
    submit: (onSettled) => {
      let acceptance: SubmissionAcceptance = false;
      // Commit an immediate turn before another scheduler update. A
      // deferred submission flushes its own turn after synchronization.
      flushSync(() => {
        acceptance = deps.submitSession(id, text, [], { managed: true, onSettled });
      });
      return acceptance;
    },
    onSettled: done,
    rejectionMessage: "The selected agent session could not accept this turn.",
  }).catch(console.error);
}

/** Redirects a worker mid-turn, without discarding what it has already done. */
export async function steerWorker(deps: WorkerDeps, id: string, text: string): Promise<void> {
  deps.flushHarnessEvents();
  const session = findSession(deps, id);
  if (!session) throw new Error("This agent is no longer available");
  if (!session.busy) throw new Error("This agent is not running a turn; send it a fresh one with message.");
  if (!isLiveHarness(session.harness) || !canSteerHarness(session.harness))
    throw new Error(
      `${session.harness} cannot take guidance mid-turn. Wait for the turn to finish, then use message.`,
    );

  // Record it on the worker before dispatch, so its own transcript shows
  // why it changed course even if the harness call then fails.
  commitSessions(
    deps,
    deps.sessionsRef.current.map((entry) => (entry.id === id ? appendSteerUser(entry, text) : entry)),
  );
  await steerHarnessTurn({
    harness: session.harness,
    sessionId: id,
    cwd: sessionWorkCwd(session),
    model: session.model,
    modelSettings: session.modelSettings,
    text,
  });
}

export function answerWorkerApproval(
  deps: WorkerDeps,
  id: string,
  requestId: number,
  decision: ApprovalDecision,
): void {
  const session = findSession(deps, id);
  if (session) respondHarnessApproval(session.harness, id, requestId, decision);
}

export function answerWorkerQuestion(deps: WorkerDeps, id: string, requestId: number, reply: UserQuestionReply): void {
  const session = findSession(deps, id);
  if (session) respondHarnessQuestion(session.harness, id, requestId, reply);
}

export async function stopWorker(deps: WorkerDeps, id: string): Promise<void> {
  const session = findSession(deps, id);
  deps.stop(id, true);
  try {
    if (session)
      await Promise.all(sessionChildHarnesses(session).map((harness) => stopHarnessSession(harness, id)));
  } finally {
    // Also reap processes left behind by a renderer reload, before the
    // corresponding session has been restored in this window.
    await invoke("harness_kill", { sessionId: id });
    await invoke("control_turn_finished", { sessionId: id });
  }
}
