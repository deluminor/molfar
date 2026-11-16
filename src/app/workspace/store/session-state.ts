import { SessionStateStore } from "@/features/sessions/model/session-state-store";
import type { WorkspaceStore } from "./types";

/**
 * The Workspace's sessions as a `SessionStateStore`, so text-only stream
 * batches reach their panes without rendering the shell. Both stay in step:
 * the store's snapshots are mirrored into `sessions`, and a direct
 * `setSessions` on the workspace store is published as a shell update.
 */
export function createWorkspaceSessionState(
  store: WorkspaceStore,
): SessionStateStore {
  const sessionState = new SessionStateStore(
    store.getState().sessions,
    (sessions) => store.getState().setSessions(sessions),
  );

  store.subscribe((state) => {
    if (state.sessions !== sessionState.snapshot()) sessionState.update(state.sessions);
  });

  return sessionState;
}
