import type { Dispatch, SetStateAction } from "react";
import type { ProjectTerminalDock } from "@/features/projects/model/project-terminal";
import type { ProjectReturnMemory } from "@/features/projects/model/project-return";
import { createComposerActions } from "../../flows/composer/composer-actions";
import { createFileActions } from "../../flows/files/file-actions";
import { createProjectActions } from "../../flows/projects/project-actions";
import type { SidebarTabSelection } from "../../flows/projects/project-deps";
import { useStableFlow } from "../use-stable-flow";
import type { HistoryFlows } from "./use-history-flows";
import type { TabFlows } from "./use-tab-flows";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

export type ProjectFlowsInput = {
  tabFlows: TabFlows;
  worktreeActions: Pick<HistoryFlows["worktreeActions"], "changeProject">;
  /** Written ahead of the store when a project folder moves. */
  projectTerminalsRef: { current: ProjectTerminalDock[] };
  setSidebarTabSelection: Dispatch<SetStateAction<SidebarTabSelection>>;
  readProjectReturnMemory(): ProjectReturnMemory;
  editorNavigationToken: { current: number };
};

export function createProjectFlows(core: WorkspaceFlowCore, input: ProjectFlowsInput) {
  const { store, sessionsRef, setSessions, tabsRef, activeTabIdRef, sidebarCwdRef, persistence, loader } = core;
  const { tabLayout } = input.tabFlows;

  const projectActions = createProjectActions({
    store,
    sessionsRef,
    setSessions,
    tabsRef,
    activeTabIdRef,
    projectCwdRef: core.projectCwdRef,
    projectTerminalsRef: input.projectTerminalsRef,
    turnGen: core.turnGen,
    loadedSessionCache: core.loadedSessionCache,
    loadingSessionIds: () => loader.loadingIds(),
    invalidateLoadedSession: (sessionId) => loader.invalidate(sessionId),
    persistence,
    setSidebarTabSelection: input.setSidebarTabSelection,
    sidebarCwd: () => sidebarCwdRef.current,
    closeAutomations: () => core.setAutomationsViewOpen(false),
    closeFamiliarView: () => core.familiarView.close(),
    navigation: {
      cancel: () => core.navigation.cancel(),
      selectProject: (path) => core.navigation.selectProject(path),
      selectWorkspace: (project, focus) => core.navigation.selectWorkspace(project, focus),
    },
    readProjectReturnMemory: () => input.readProjectReturnMemory(),
    activateTab: (tabId, paneId) => tabLayout.activate(tabId, paneId),
    insertBeside: tabLayout.insertBeside,
    changeSessionProject: (sessionId, cwd) => input.worktreeActions.changeProject(sessionId, cwd),
    selectTab: (tabId) => core.selectTab(tabId),
    focusComposer: () => core.setComposerFocused(true),
    fileMoved: (from, to) => fileActions.moved(from, to),
  });

  const fileActions = createFileActions({
    store,
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    gitCwd: () => core.gitCwdRef.current,
    sidebarCwd: () => sidebarCwdRef.current,
    editorNavigationToken: input.editorNavigationToken,
    closeFamiliarView: () => core.familiarView.close(),
    insertBesideActive: (tabs, tab, cwd) => tabLayout.insertBesideActive(tabs, tab, cwd),
    activateTab: (tabId, paneId) => tabLayout.activate(tabId, paneId),
    selectTab: (tabId) => core.selectTab(tabId),
    setComposerFocused: (focused) => core.setComposerFocused(focused),
  });

  const composerActions = createComposerActions({
    store,
    sessionsRef,
    setSessions,
    persistence,
    invalidateLoadedSession: (sessionId) => loader.invalidate(sessionId),
  });

  return { projectActions, fileActions, composerActions };
}

export type ProjectFlows = ReturnType<typeof createProjectFlows>;

/** Project selection and moves, file opening and the composer's session edits, created once. */
export function useProjectFlows(core: WorkspaceFlowCore, input: ProjectFlowsInput): ProjectFlows {
  return useStableFlow(() => createProjectFlows(core, input));
}
