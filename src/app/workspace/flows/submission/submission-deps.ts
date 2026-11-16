import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@/domain/session/session";
import type { synchronizeProjectLocation } from "@/features/projects/model/project-location";
import type { EditedResendCoordinator } from "@/features/sessions/model/edit-last-turn";
import type { HarnessEvent } from "@/integrations/harness";
import type { Submit } from "./submit-types";

/** The workspace state a submission reads and writes, as App holds it. */
export type SubmissionDeps = {
  sessionsRef: { current: Session[] };
  setSessions: Dispatch<SetStateAction<Session[]>>;
  /** Turn generation per session; a bump orphans the running turn's events. */
  turnGen: { readonly current: Map<string, number> };
  activeSessionIdRef: { readonly current: string | undefined };
  removingSessionIds: { readonly current: Set<string> };
  switchingWorktrees: { readonly current: Map<string, string> };
  removingWorktreePaths: { readonly current: Set<string> };
  projectLocationSyncs: {
    readonly current: Map<string, ReturnType<typeof synchronizeProjectLocation>>;
  };
  /** Workspace a session's tab shows, kept when its draft worktree is created. */
  workspacePins: { readonly current: Map<string, string> };
  /** Submits again once the project location is synchronized. */
  submitAfterProjectSyncRef: { readonly current: Submit };
  editedResends: EditedResendCoordinator;
  workspaceNavigation: { isSwitching(sessionId: string): boolean };
  enqueueHarnessEvent(sessionId: string, event: HarnessEvent): void;
  flushHarnessEvents(): void;
  dismissNoticesForContinuedSession(sessionId: string): void;
  applyProjectLocationChange(from: string, to: string): Promise<void>;
};
