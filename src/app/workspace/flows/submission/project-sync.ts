import { looksLikeProject } from "@/features/projects/model/recents";
import { synchronizeProjectLocation } from "@/features/projects/model/project-location";
import { pathKey } from "@/shared/lib/paths";
import {
  type SubmissionAcceptance,
  submitAfterProjectSync,
} from "../../../model/submission-acceptance";
import type { PreparedSubmission } from "./prepared-submission";
import type { SubmissionDeps } from "./submission-deps";

/**
 * A project's folder may have moved since it was opened: resolve it once,
 * then submit again. Undefined when the location is already settled.
 */
export function submitAfterProjectLocation(
  deps: SubmissionDeps,
  turn: PreparedSubmission,
): SubmissionAcceptance | undefined {
  const { projectLocationSyncs, enqueueHarnessEvent, flushHarnessEvents } = deps;
  const { sessionId, text, attachments, options, current, editedResend } = turn;
  if (options?.projectLocationReady || !looksLikeProject(current.cwd) || current.worktreeCwd)
    return undefined;

  const key = pathKey(current.cwd);
  let sync = projectLocationSyncs.current.get(key);
  if (!sync) {
    sync = synchronizeProjectLocation(current.cwd);
    projectLocationSyncs.current.set(key, sync);
    void sync.then(
      () => projectLocationSyncs.current.delete(key),
      () => projectLocationSyncs.current.delete(key),
    );
  }

  return submitAfterProjectSync({
    cwd: current.cwd,
    sync,
    applyLocationChange: deps.applyProjectLocationChange,
    submit: async () => {
      const accepted = await deps.submitAfterProjectSyncRef.current(sessionId, text, attachments, {
        ...options,
        projectLocationReady: true,
      });
      if (!accepted) {
        editedResend?.reject();
        options?.onSettled?.({
          status: "failed",
          text: "",
          error:
            "The chat became unavailable before the request could start. Try again when it is ready.",
        });
      }
      return accepted;
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "The project folder could not be opened.";
      enqueueHarnessEvent(sessionId, { type: "session.error", message });
      flushHarnessEvents();
      editedResend?.reject();
      options?.onSettled?.({ status: "failed", text: "", error: message });
    },
  });
}
