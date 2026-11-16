import { vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { createEditedResendCoordinator } from "@/features/sessions/model/edit-last-turn";
import { testSession } from "@/integrations/harness/core/test-session";
import type { SubmissionDeps } from "./submission-deps";

/** Submission deps over open sessions, starting with session `s` in `/work/demo`. */
export function setupSubmission(patch: Partial<Session> = {}) {
  const sessionsRef = { current: [{ ...testSession("claude", "/work/demo"), id: "s", ...patch }] };
  const deps: SubmissionDeps = {
    sessionsRef,
    setSessions: (update) => {
      sessionsRef.current =
        typeof update === "function" ? update(sessionsRef.current) : update;
    },
    turnGen: { current: new Map() },
    activeSessionIdRef: { current: "s" },
    removingSessionIds: { current: new Set() },
    switchingWorktrees: { current: new Map() },
    removingWorktreePaths: { current: new Set() },
    projectLocationSyncs: { current: new Map() },
    workspacePins: { current: new Map() },
    submitAfterProjectSyncRef: { current: () => false },
    editedResends: createEditedResendCoordinator(),
    workspaceNavigation: { isSwitching: () => false },
    enqueueHarnessEvent: vi.fn(),
    flushHarnessEvents: vi.fn(),
    dismissNoticesForContinuedSession: vi.fn(),
    applyProjectLocationChange: vi.fn(async () => undefined),
  };

  return { deps, session: (): Session => sessionsRef.current[0] };
}
