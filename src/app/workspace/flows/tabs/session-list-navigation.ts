import type { Session } from "@/domain/session/session";
import { rememberRemoteSession, remoteSessionFor } from "@/features/connections/model/connections";
import { isRemoteProjectPath } from "@/features/projects/model/recents";
import { adjacentItemId } from "@/features/workspace/model/tab-keys";
import { switchSessionInTab } from "@/features/workspace/model/workspace-tab-groups";
import type { PaneDeps } from "./pane-deps";

export type SessionListDeps = PaneDeps & {
  /** The sidebar's session ids, in the order the user sees them. */
  navigationIds: { readonly current: readonly string[] };
  selectHistorySession(sessionId: string): Promise<unknown>;
  selectRemoteSession(project: string, remoteSessionId: string): void;
  prefetch(sessionId: string): void;
};

/** A remote project's session steps through the host's ids, in place or in its own tab. */
function stepRemote(deps: SessionListDeps, current: Session, next: string, inCurrentTab: boolean): void {
  if (inCurrentTab) {
    rememberRemoteSession(current.id, next);
    deps.setComposerFocused(true);
  } else {
    deps.selectRemoteSession(current.cwd, next);
  }
}

/** Swaps the focused pane's session for `next`, unless focus moved meanwhile. */
async function switchInPlace(deps: SessionListDeps, tabId: string, focusedId: string, next: string, prefetchAhead: () => void) {
  const session = await deps.ensureOpenSession(next);
  prefetchAhead();
  if (!session || session.inboxAsk) return;
  if (deps.activeTabIdRef.current !== tabId) return;
  if (deps.tabsRef.current.find((tab) => tab.id === tabId)?.focusedId !== focusedId) return;

  deps.store.getState().setTabs((prev) => switchSessionInTab(prev, tabId, focusedId, next) ?? prev);
  deps.setComposerFocused(true);
  const linkedUpdate = deps.linkedUpdates().get(next);
  if (linkedUpdate) deps.revealLinkedUpdate(next, linkedUpdate);
}

/** Steps to the previous or next session of the sidebar, in its tab or in place. */
export function navigateSessionList(deps: SessionListDeps, delta: number, inCurrentTab = false): void {
  const activeWorkspace = deps.tabsRef.current.find((entry) => entry.id === deps.activeTabIdRef.current);
  if (!activeWorkspace || activeWorkspace.diffFocused) return;
  const current = deps.sessionsRef.current.find((session) => session.id === activeWorkspace.focusedId);
  if (!current) return;
  const remoteProject = isRemoteProjectPath(current.cwd);
  const navigationId = remoteProject ? remoteSessionFor(current.id) : current.id;
  if (!navigationId) return;

  const next = adjacentItemId(deps.navigationIds.current, navigationId, delta);
  if (!next || next === navigationId) return;
  if (remoteProject) {
    stepRemote(deps, current, next, inCurrentTab);
    return;
  }

  // Stepping gives no hover to warm the transcript, so load the one a
  // further step away once this switch has its own session.
  const prefetchAhead = () => {
    const ahead = adjacentItemId(deps.navigationIds.current, next, delta);
    if (ahead && ahead !== current.id) deps.prefetch(ahead);
  };
  if (!inCurrentTab) {
    void deps.selectHistorySession(next).then(prefetchAhead);
    return;
  }
  void switchInPlace(deps, activeWorkspace.id, current.id, next, prefetchAhead);
}
