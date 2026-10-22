import { useSyncExternalStore } from "react";
import type { Session } from "@/domain/session/session";
import type { SessionStateStore } from "@/features/sessions/model/session-state-store";
import { createWorkspaceSessionState } from "../store/session-state";
import type { WorkspaceStore } from "../store/types";
import { useStableFlow } from "./use-stable-flow";

export type WorkspaceSessions = {
  /** Re-renders on shell updates only; text-only stream batches skip it. */
  sessions: Session[];
  setSessions: SessionStateStore["setState"];
  /** The latest snapshot, for runtime callbacks between renders. */
  sessionsRef: SessionStateStore["ref"];
  sessionState: SessionStateStore;
};

/** The Workspace's sessions; everything but `sessions` is stable (biome.json). */
export function useWorkspaceSessions(store: WorkspaceStore): WorkspaceSessions {
  const sessionState = useStableFlow(() => createWorkspaceSessionState(store));
  const sessions = useSyncExternalStore(
    sessionState.subscribeShell,
    sessionState.snapshot,
  );

  return {
    sessions,
    setSessions: sessionState.setState,
    sessionsRef: sessionState.ref,
    sessionState,
  };
}
