import type { PlanBuildTarget } from "@/domain/session/turn";
import { buildPlan, updatePlan } from "./plan-block";
import {
  editQueuedMessage,
  removeQueuedMessage,
  resumeQueue,
  setQueuedMessageEditing,
  steerQueuedMessage,
} from "./queue-actions";
import type { TurnQueueDeps } from "./turn-queue-deps";

/** The plan block and queued follow-up flows bound to `deps`, created once for the workspace. */
export function createTurnQueueActions(deps: TurnQueueDeps) {
  return {
    updatePlan: (sessionId: string, blockId: string, text: string) =>
      updatePlan(deps, sessionId, blockId, text),
    buildPlan: (sessionId: string, blockId: string, target?: PlanBuildTarget) =>
      buildPlan(deps, sessionId, blockId, target),
    removeQueued: (sessionId: string, messageId: string) => removeQueuedMessage(deps, sessionId, messageId),
    setQueuedEditing: (sessionId: string, messageId?: string) =>
      setQueuedMessageEditing(deps, sessionId, messageId),
    editQueued: (sessionId: string, messageId: string, text: string) =>
      editQueuedMessage(deps, sessionId, messageId, text),
    steerQueued: (sessionId: string, messageId: string) => steerQueuedMessage(deps, sessionId, messageId),
    resume: (sessionId: string) => resumeQueue(deps, sessionId),
  };
}

export type TurnQueueActions = ReturnType<typeof createTurnQueueActions>;
