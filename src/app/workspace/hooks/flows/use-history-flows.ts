import { orchestrator } from "@/features/orchestration/model/orchestration";
import {
  deleteSession,
  getSession,
  setSessionArchived,
  setSessionPinned,
  upsertSession,
} from "@/features/sessions/data/session-store";
import { flushSessionCheckpoint } from "@/features/sessions/model/checkpoint";
import { getUpdatePrompt } from "@/features/updates/model/update-prompt";
import { getAppDialog } from "@/shared/lib/app-dialog";
import type { FamiliarRemovalDeps } from "../../flows/familiars/familiar-removal";
import type { SessionActionsDeps } from "../../flows/session-history/session-actions";
import { createSessionHistoryActions } from "../../flows/session-history/session-history-actions";
import type { SessionRemovalChangeDeps } from "../../flows/session-history/session-removal-change";
import type { RemoveSessionDeps } from "../../flows/session-removal/remove-session";
import { createWorktreeActions } from "../../flows/worktrees/worktree-actions";
import type { WorktreeDeps } from "../../flows/worktrees/worktree-deps";
import { useStableFlow } from "../use-stable-flow";
import type { TabFlows } from "./use-tab-flows";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

export type HistoryFlowsInput = {
  tabFlows: TabFlows;
  /** Only one delete confirmation is open at a time. */
  deleteConfirmationPending: { current: boolean };
  automationsViewOpenRef: { readonly current: boolean };
};

export function createHistoryFlows(core: WorkspaceFlowCore, input: HistoryFlowsInput) {
  const { store, sessionsRef, setSessions, tabsRef, activeTabIdRef, sidebarCwdRef, persistence, loader } = core;
  const { tabLayout } = input.tabFlows;
  const commitSessions: FamiliarRemovalDeps["commitSessions"] = (next) => {
    sessionsRef.current = next;
    setSessions(next);
  };
  const refreshSidebarHistory = () => void core.refreshHistory(sidebarCwdRef.current);

  const session: SessionActionsDeps = {
    store,
    openSessions: () => sessionsRef.current,
    loader,
    persistence,
    cache: core.loadedSessionCache.current,
    refreshHistory: refreshSidebarHistory,
    getSession,
    upsertSession,
    setSessionPinned,
  };

  const worktreeDeps: WorktreeDeps = {
    store,
    sessionsRef,
    setSessions,
    tabsRef,
    setTabs: core.setTabs,
    projectTerminals: () => store.getState().projectTerminals,
    projectCwd: () => core.projectCwdRef.current,
    removingSessionIds: core.removingSessionIds,
    switchingWorktrees: core.switchingWorktrees,
    removingWorktreePaths: core.removingWorktreePaths,
    workspacePins: core.workspacePins,
    persistence,
    invalidateLoadedSession: (sessionId) => loader.invalidate(sessionId),
    stopSessionForRemoval: (sessionId) => core.stopSessionForRemoval(sessionId),
    appendTab: (tab, cwd) => tabLayout.append(tab, cwd),
    openSessionTab: (opened, cwd) => tabLayout.openSessionTab(opened, cwd),
    selectTab: (tabId) => core.selectTab(tabId),
    focusComposer: () => core.setComposerFocused(true),
    refreshHistory: (cwd) => core.refreshHistory(cwd),
    projectOfTab: (tabId) => core.projectOfTab(tabId),
  };
  const worktreeActions = createWorktreeActions(worktreeDeps);

  const removalChange: SessionRemovalChangeDeps = {
    store,
    openSessions: () => sessionsRef.current,
    commitSessions,
    commitTabs: (next) => {
      tabsRef.current = next;
      core.setTabs(next);
    },
    activeTabId: () => activeTabIdRef.current,
    activateTab: (tabId) => tabLayout.activate(tabId),
    setComposerFocused: (focused) => core.setComposerFocused(focused),
    loader,
    persistence,
    cache: core.loadedSessionCache.current,
    refreshHistory: refreshSidebarHistory,
  };
  const removal: RemoveSessionDeps = {
    store,
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    dirtyFiles: () => store.getState().dirtyFiles,
    removingSessionIds: core.removingSessionIds,
    switchingWorktrees: core.switchingWorktrees,
    deleteConfirmationPending: input.deleteConfirmationPending,
    persistence,
    removalChange,
    invalidateLoadedSession: (sessionId) => loader.invalidate(sessionId),
    sidebarCwd: () => sidebarCwdRef.current,
    stopSessionForRemoval: (sessionId) => core.stopSessionForRemoval(sessionId),
    removeWorktree: (cwd, path, force) => worktreeActions.remove(cwd, path, force),
  };

  const historyActions = createSessionHistoryActions({
    session,
    removal,
    link: {
      store,
      sessionsRef,
      setSessions,
      sidebarCwd: () => sidebarCwdRef.current,
      forgetLoaded: (id) => {
        loader.invalidate(id);
        core.loadedSessionCache.current.delete(id);
      },
      refreshHistory: core.refreshHistory,
    },
    familiarRemoval: {
      store,
      sessionsRef,
      removingSessionIds: core.removingSessionIds,
      persistence,
      view: core.familiarView,
      commitSessions,
      invalidateLoadedSession: (sessionId) => loader.invalidate(sessionId),
      stopSessionForRemoval: (sessionId) => core.stopSessionForRemoval(sessionId),
      flushCheckpoint: flushSessionCheckpoint,
      deleteStoredSession: (sessionId, imagePaths) =>
        orchestrator.deleteSession(sessionId, () => deleteSession(sessionId, imagePaths)),
    },
    setSessionArchived,
    archiveContext: () => {
      const state = store.getState();
      return {
        activeTabId: activeTabIdRef.current,
        tabs: tabsRef.current,
        sessions: sessionsRef.current,
        projectTerminalFocused: state.projectTerminalFocused,
        surfaceOpen: Boolean(
          state.familiarViewId ||
            state.searchViewOpen ||
            state.inboxViewOpen ||
            state.notesViewOpen ||
            input.automationsViewOpenRef.current ||
            state.settingsOpen ||
            state.filePickerOpen ||
            state.whatsNewVersion ||
            getUpdatePrompt() ||
            getAppDialog(),
        ),
      };
    },
  });

  return { worktreeDeps, worktreeActions, historyActions };
}

export type HistoryFlows = ReturnType<typeof createHistoryFlows>;

/** Worktree moves and the rename, pin, archive and delete flows of sessions, created once. */
export function useHistoryFlows(core: WorkspaceFlowCore, input: HistoryFlowsInput): HistoryFlows {
  return useStableFlow(() => createHistoryFlows(core, input));
}
