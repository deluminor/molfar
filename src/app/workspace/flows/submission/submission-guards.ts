import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { isPreparingHandoff } from "@/features/sessions/model/handoff";
import { isEqualOrInside } from "@/shared/lib/paths";
import type { SubmissionDeps } from "./submission-deps";
import type { SubmitOptions } from "./submit-types";

/**
 * The session a submission may go to, or undefined when it must be refused
 * now: being removed, switching worktree, already running an app request, or
 * held by orchestration.
 */
export function submittableSession(
  deps: SubmissionDeps,
  sessionId: string,
  options?: SubmitOptions,
): Session | undefined {
  const {
    sessionsRef,
    editedResends,
    removingSessionIds,
    switchingWorktrees,
    removingWorktreePaths,
    workspaceNavigation,
    enqueueHarnessEvent,
    flushHarnessEvents,
  } = deps;
  if (editedResends.isActive(sessionId)) return undefined;

  // Output already received belongs before the submitted user message.
  // Flush before reading the session too, since pending errors can settle it.
  flushHarnessEvents();
  const controlError = orchestrator.submissionError(sessionId, options?.managed);
  if (controlError) {
    enqueueHarnessEvent(sessionId, { type: "status", text: controlError });
    flushHarnessEvents();
    return undefined;
  }

  if (options?.managed) {
    const target = sessionsRef.current.find((s) => s.id === sessionId);
    if (
      !target ||
      target.busy ||
      target.pendingSwitch ||
      isPreparingHandoff(target) ||
      removingSessionIds.current.has(sessionId)
    ) {
      options.onSettled?.({
        status: "failed",
        text: "",
        error: "Session is unavailable or already running",
      });
      return undefined;
    }
  }
  if (
    removingSessionIds.current.has(sessionId) ||
    switchingWorktrees.current.has(sessionId) ||
    workspaceNavigation.isSwitching(sessionId)
  )
    return undefined;

  const storedCurrent = sessionsRef.current.find((s) => s.id === sessionId);
  if (options?.appRequestId && storedCurrent?.busy) return undefined;
  if (
    options?.ciRepair &&
    storedCurrent &&
    (storedCurrent.busy || storedCurrent.pendingSwitch || isPreparingHandoff(storedCurrent))
  )
    return undefined;
  if (
    !storedCurrent ||
    storedCurrent.worktreeRemoved ||
    [...removingWorktreePaths.current].some((path) =>
      isEqualOrInside(sessionWorkCwd(storedCurrent), path),
    )
  )
    return undefined;
  return storedCurrent;
}
