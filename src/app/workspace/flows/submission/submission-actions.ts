import type { SubmissionDeps } from "./submission-deps";
import { submitSession } from "./submit-session";
import type { Submit } from "./submit-types";

/** Submitting turns bound to the workspace, created once; a deferred project sync submits through the same entry. */
export function createSubmissionActions(deps: Omit<SubmissionDeps, "submitAfterProjectSyncRef">) {
  const submitAfterProjectSyncRef: { current: Submit } = { current: () => false };
  const bound: SubmissionDeps = { ...deps, submitAfterProjectSyncRef };
  const submit: Submit = (...args) => submitSession(bound, ...args);
  submitAfterProjectSyncRef.current = submit;

  return {
    /** Resolves when the turn is actually accepted; the queued-launch receiver awaits it. */
    submit,
    /** Interactive callers use the immediate result to clear their composer. */
    send: (...args: Parameters<Submit>): boolean => {
      // Reject before async preparation can make the composer clear its draft.
      if (deps.workspaceNavigation.isSwitching(args[0])) return false;
      const result = submit(...args);
      if (typeof result === "boolean") return result;
      // Deferred errors have already been displayed by submitAfterProjectSync.
      void result.catch(() => undefined);
      return true;
    },
  };
}

export type SubmissionActions = ReturnType<typeof createSubmissionActions>;
