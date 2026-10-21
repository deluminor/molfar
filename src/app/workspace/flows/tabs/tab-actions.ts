import type { GitFileDiffKind } from "@/domain/git/working-tree";
import type { GitHistoryCommit } from "@/platform/tauri/fs";
import type { MonoChangesRequest } from "@/features/familiars/ui/FamiliarChangesView";
import {
  openChangesTab,
  openCommitTab,
  type PaneEdge,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import { openDiff } from "../files/open-diff";
import { detachPane, focusPane } from "./pane-focus";
import { placeSessionOnPane, placeTabOnPane } from "./place-session";
import type { TabActionsDeps } from "./tab-actions-deps";
import { cycleTab, tabInSlot } from "./tab-cycle";
import { movePaneTo, reorderPaneFiles, reorderTabs } from "./tab-layout";

type DiffSession = { sessionId: string; cwd: string };

/** Tab stepping, pane moves and diff/commit openers bound to `deps`, created once for the workspace. */
export function createTabActions(deps: TabActionsDeps) {
  const { pane, diff } = deps;
  const { store } = pane;
  const activeTabId = () => pane.activeTabIdRef.current;

  // A Familiar's full view covers the tabs; stepping returns to them first.
  const leaveFamiliarView = (): boolean => {
    if (!store.getState().familiarViewId) return false;
    pane.activateTab(activeTabId());
    return true;
  };

  const cycle = (step: 1 | -1) => {
    if (leaveFamiliarView()) return;
    const tab = cycleTab(deps.deckTabs(), activeTabId(), step);
    if (tab) pane.activateTab(tab.id);
  };

  const visit = (direction: "back" | "forward") => {
    if (leaveFamiliarView()) return;
    const openTabIds = new Set(pane.tabsRef.current.map((tab) => tab.id));
    const tabId = deps.visits.step(direction, openTabIds, activeTabId());
    if (tabId) pane.activateTab(tabId);
  };

  const updateActiveTab = (update: (tab: WorkspaceTab) => WorkspaceTab) => {
    const tabId = activeTabId();
    store.getState().setTabs((prev) => prev.map((tab) => (tab.id === tabId ? update(tab) : tab)));
    pane.setComposerFocused(false);
  };

  const showDiff = (
    path?: string,
    session?: DiffSession,
    changeKind?: GitFileDiffKind,
    pin = false,
    options?: { exact?: boolean },
  ) => {
    void openDiff(diff, path, { session, changeKind, pin, exact: options?.exact });
  };

  // A Familiar view covers the workspace, so its session changes open on the
  // overview's Changes tab instead of in a project tab hidden behind it.
  const openMonoChanges = (request: MonoChangesRequest) => {
    const state = store.getState();
    state.setFamiliarShownSession(null);
    state.setFamiliarOverviewDocument(null);
    state.setFamiliarChangesRequest(request);
    state.setFamiliarOverviewTab("changes");
    state.setFamiliarOverviewOpen(true);
  };

  return {
    next: () => cycle(1),
    prev: () => cycle(-1),
    visitBack: () => visit("back"),
    visitForward: () => visit("forward"),
    activateSlot: (slot: number) => {
      const tab = tabInSlot(deps.deckTabs(), slot);
      if (tab) pane.activateTab(tab.id);
    },
    focusPane: (paneId: string) => focusPane(pane, paneId),
    movePane: (fromId: string, toId: string, edge: PaneEdge) => movePaneTo(store, fromId, toId, edge),
    detachPane: (paneId: string, targetTabId: string, position: "before" | "after") =>
      detachPane(pane, paneId, targetTabId, position),
    reorderTabs: (ids: string[], movedId?: string) => reorderTabs(deps.layout, ids, movedId),
    reorderFiles: (paneId: string, ids: string[]) => reorderPaneFiles(store, paneId, ids),
    placeSession: (sessionId: string, targetId: string, edge: PaneEdge) =>
      placeSessionOnPane(deps.place, sessionId, targetId, edge),
    placeTab: (sourceTabId: string, targetId: string, edge: PaneEdge) =>
      placeTabOnPane(deps.place, sourceTabId, targetId, edge),
    openDiff: showDiff,
    openWorkingTreeDiff: (path: string, kind?: GitFileDiffKind, pin?: boolean) =>
      showDiff(path, undefined, kind, pin, { exact: true }),
    openMonoDiff: (path?: string, session?: DiffSession) => {
      if (session) openMonoChanges({ path });
      else showDiff(path);
    },
    commitMonoChanges: () => openMonoChanges({}),
    /** Stack one section's working-tree changes in one review, whatever the diff-view setting. */
    openAllChanges: (kind: GitFileDiffKind) =>
      updateActiveTab((tab) => openChangesTab(tab, diff.gitCwd(), undefined, kind, diff.sidebarCwd())),
    openCommit: (commit: GitHistoryCommit, pin?: boolean) =>
      updateActiveTab((tab) =>
        openCommitTab(
          tab,
          diff.gitCwd(),
          { sha: commit.sha, shortSha: commit.shortSha, subject: commit.subject },
          diff.sidebarCwd(),
          pin,
        ),
      ),
    showSourceControl: () => diff.setSidebarTab("changes"),
  };
}

export type TabActions = ReturnType<typeof createTabActions>;
