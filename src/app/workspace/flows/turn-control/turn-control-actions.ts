import type { ApprovalDecision, UserQuestionReply } from "@/integrations/harness";
import { compactContext } from "./compact-context";
import { answerApproval, answerQuestion, type HarnessReplyDeps, keepQuestionOpen } from "./harness-replies";
import { stopTurn } from "./stop-turn";
import type { TurnControlDeps } from "./turn-control-deps";

/** Stop, compact and harness reply flows bound to `deps`, created once for the workspace. */
export function createTurnControlActions(deps: { control: TurnControlDeps; reply: HarnessReplyDeps }) {
  const { control, reply } = deps;

  return {
    stop: (sessionId: string, managed = false) => stopTurn(control, sessionId, managed),
    compact: (sessionId: string) => compactContext(control, sessionId),
    approve: (sessionId: string, requestId: number, decision: ApprovalDecision) =>
      answerApproval(reply, sessionId, requestId, decision),
    answer: (sessionId: string, requestId: number, answer: UserQuestionReply) =>
      answerQuestion(reply, sessionId, requestId, answer),
    keepQuestionOpen: (sessionId: string, requestId: number) => keepQuestionOpen(reply, sessionId, requestId),
  };
}

export type TurnControlActions = ReturnType<typeof createTurnControlActions>;
