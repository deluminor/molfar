import type { Session } from "@/domain/session/session";
import { remoteProjectFor } from "@/features/connections/model/remote-projects";
import { remoteSessionActions } from "@/features/connections/model/remote-session-actions";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import { takeRelayedApproval } from "@/features/familiars/model/familiar-habits";
import {
  type ApprovalDecision,
  keepHarnessQuestionOpen,
  respondHarnessApproval,
  respondHarnessQuestion,
  type UserQuestionReply,
} from "@/integrations/harness";

export type HarnessReplyDeps = {
  sessions(): Session[];
  /** Settles an approval a Familiar relayed into its chat. */
  decideFamiliarApproval(
    familiarId: string,
    blockId: string,
    decided: "allow" | "deny" | "cancelled",
  ): void;
};

function answerableSession(deps: HarnessReplyDeps, sessionId: string): Session | undefined {
  const session = deps.sessions().find((entry) => entry.id === sessionId);
  return session && !session.worktreeRemoved ? session : undefined;
}

/**
 * An approval a habit's hidden run asked for, put to the user in the
 * Familiar's chat: answers the run and settles the question in the chat.
 */
function answerRelayedApproval(
  deps: HarnessReplyDeps,
  familiar: Session,
  requestId: number,
  decision: ApprovalDecision,
): boolean {
  const asked = familiar.blocks.find(
    (block) => block.familiarHabit && block.approval?.requestId === requestId,
  );
  if (!asked) return false;

  const relay = takeRelayedApproval(familiar.id, requestId);
  const run = relay ? deps.sessions().find((entry) => entry.id === relay.runId) : undefined;
  if (relay && run) respondHarnessApproval(run.harness, run.id, relay.requestId, decision);

  let decided: "allow" | "deny" | "cancelled" = "cancelled";
  if (relay && run) decided = decision === "deny" ? "deny" : "allow";
  deps.decideFamiliarApproval(familiar.id, asked.id, decided);
  return true;
}

export function answerApproval(
  deps: HarnessReplyDeps,
  sessionId: string,
  requestId: number,
  decision: ApprovalDecision,
): void {
  const session = answerableSession(deps, sessionId);
  if (!session) return;
  if (isFamiliarSession(sessionId) && answerRelayedApproval(deps, session, requestId, decision))
    return;

  if (remoteProjectFor(session.cwd)) {
    remoteSessionActions(sessionId)?.approve(requestId, decision);
    return;
  }
  respondHarnessApproval(session.harness, sessionId, requestId, decision);
}

export function answerQuestion(
  deps: HarnessReplyDeps,
  sessionId: string,
  requestId: number,
  reply: UserQuestionReply,
): void {
  const session = answerableSession(deps, sessionId);
  if (!session) return;

  if (remoteProjectFor(session.cwd)) {
    remoteSessionActions(sessionId)?.answer(requestId, reply);
    return;
  }
  respondHarnessQuestion(session.harness, sessionId, requestId, reply);
}

/** The user is working on a question's form; keeps it from auto-resolving. */
export function keepQuestionOpen(
  deps: HarnessReplyDeps,
  sessionId: string,
  requestId: number,
): void {
  const session = deps.sessions().find((entry) => entry.id === sessionId);
  if (session && remoteProjectFor(session.cwd)) return;
  if (session && !session.worktreeRemoved)
    keepHarnessQuestionOpen(session.harness, sessionId, requestId);
}
