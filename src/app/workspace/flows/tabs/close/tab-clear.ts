import { startTransition } from "react";
import type { Session } from "@/domain/session/session";
import { remoteSessionFor } from "@/features/connections/model/connections";
import { sameProjectPath } from "@/features/projects/model/recents";
import { newSession } from "@/features/sessions/model/session";
import { worktreeFocus } from "@/features/source-control/model/worktree-focus";
import {
  isViewTab,
  nextDisplayedTabAfterClose,
} from "@/features/workspace/model/app-view-tabs";
import { leafIds, resetTabToSession } from "@/features/workspace/model/layout";
import { isBlankWorkspaceTab } from "../../../../model/blank-workspace-tab";
import type { TabCloseDeps } from "./tab-close-deps";
import { closeTab } from "./tab-close";
import {
  closePlan,
  forgetDirty,
  forgetRemoteShell,
  tabFiles,
  unsavedFiles,
} from "./tab-close-steps";

/**
 * Starts the tab over on a blank session in the same worktree, saving the
 * conversation it held. `selectNeighbor` then moves to the next title tab.
 */
export function clearTabSession(
  deps: TabCloseDeps,
  tabId: string,
  options?: { confirmed?: boolean; selectNeighbor?: boolean },
): void {
  const tab = deps.tabs().find((entry) => entry.id === tabId);
  if (!tab) return;
  const navigation = deps.navigation();
  const neighborId = options?.selectNeighbor
    ? nextDisplayedTabAfterClose(navigation.tabs, navigation.activeId, tabId)
    : undefined;
  const selectNeighbor = () => {
    if (neighborId) navigation.select?.(neighborId);
  };
  if (isBlankWorkspaceTab(tab, deps.sessions())) {
    selectNeighbor();
    return;
  }

  const files = tabFiles(tab);
  const sessionId = leafIds(tab.layout).find((paneId) =>
    deps.sessions().some((session) => session.id === paneId),
  );
  const oldSession = deps.sessions().find((session) => session.id === sessionId);
  if (!oldSession) return;

  const clear = () => {
    deps.persist(oldSession);
    for (const shellId of leafIds(tab.layout)) forgetRemoteShell(shellId);

    const session = blankSuccessor(oldSession, deps.tabWorkspace(tab, deps.sessions()));
    deps.setSessions((previous) => [...previous, session]);
    forgetDirty(
      deps,
      files.map((file) => file.id),
    );
    deps.store
      .getState()
      .setTabs((previous) =>
        previous.map((entry) => (entry.id === tabId ? resetTabToSession(entry, session.id) : entry)),
      );
    deps.setComposerFocused(true);
    deps.refreshHistory();
    selectNeighbor();
  };
  // A view tab opens in a transition; clearing alongside it keeps the blank
  // tab from painting before the view.
  const finish = () => {
    if (neighborId && isViewTab(neighborId)) startTransition(clear);
    else clear();
  };

  // The caller already confirmed unsaved files.
  if (unsavedFiles(deps, files).length === 0 || options?.confirmed) {
    finish();
    return;
  }
  void deps
    .confirmDiscardUnsaved("Close this conversation with unsaved files?")
    .then((ok) => ok && finish());
}

/**
 * The blank replacement stays in the tab's worktree, so clearing the last tab
 * there does not switch the workspace back to the project.
 */
function blankSuccessor(old: Session, workspace: string | null): Session {
  const session = newSession(old.harness, old.cwd, old.model, old.runtimeMode, old.modelSettings);
  if (!workspace || sameProjectPath(workspace, old.cwd)) return session;

  const focus = worktreeFocus(old.cwd);
  const focusBranch = focus && sameProjectPath(focus.path, workspace) ? focus.branch : undefined;
  const ownBranch =
    old.worktreeCwd && sameProjectPath(old.worktreeCwd, workspace) ? old.branch : undefined;

  return { ...session, worktreeCwd: workspace, branch: focusBranch ?? ownBranch ?? undefined };
}

/** A remote conversation was deleted on its machine: close or clear its tab. */
export function closeDeletedRemoteSession(deps: TabCloseDeps, remoteSessionId: string): void {
  const tab = deps
    .tabs()
    .find((entry) =>
      leafIds(entry.layout).some((shellId) => remoteSessionFor(shellId) === remoteSessionId),
    );
  if (!tab) return;

  if (closePlan(deps, tab.id).action === "keep") clearTabSession(deps, tab.id);
  else closeTab(deps, tab.id);
}
