import type { WorkspaceFlowCore } from "../flows/workspace-flow-core";
import { useStableFlow } from "../use-stable-flow";
import type { WorkspaceFlowsInput } from "./types";
import { useOpeningFlows } from "./use-opening-flows";
import { useRunningFlows } from "./use-running-flows";

/** The flow core every builder shares, built once from the first render's input. */
export function workspaceFlowCore(input: WorkspaceFlowsInput): WorkspaceFlowCore {
  const { core, storage, sidebar } = input;
  return {
    store: core.workspaceStore,
    sessionsRef: core.sessionsRef,
    setSessions: core.setSessions,
    tabsRef: core.tabsRef,
    setTabs: core.setTabs,
    activeTabIdRef: core.activeTabIdRef,
    projectCwdRef: core.projectCwdRef,
    sidebarCwdRef: input.sidebarCwdRef,
    gitCwdRef: input.gitCwdRef,
    sessionDefaultsRef: input.sessionDefaultsRef,
    activeTabRef: input.activeTabRef,
    insetLayoutRef: core.insetLayoutRef,
    persistence: storage.sessionPersistence,
    loader: storage.sessionLoader,
    loadedSessionCache: storage.loadedSessionCache,
    openingSessionIds: storage.openingSessionIds,
    removingSessionIds: storage.removingSessionIds,
    switchingWorktrees: core.switchingWorktrees,
    removingWorktreePaths: core.removingWorktreePaths,
    workspacePins: core.workspacePins,
    turnGen: core.turnGen,
    familiarView: input.familiarView,
    navigation: input.navigation,
    setActiveTabId: core.setActiveTabIdState,
    selectTab: input.selectTab,
    setComposerFocused: core.setComposerFocused,
    setAutomationsViewOpen: core.setAutomationsViewOpen,
    setSidebarTab: sidebar.setSidebarTab,
    leaveCoveringFamiliar: input.leaveCoveringFamiliar,
    refreshHistory: input.refreshHistory,
    stopSessionForRemoval: input.harness.stopSessionForRemoval,
    projectOfTab: core.projectOfTab,
    tabWorkspace: core.tabWorkspace,
  };
}

/** The Workspace's domain flows in their render order: opening (tabs … projects), then running (submission … orchestration). */
export function useWorkspaceFlows(input: WorkspaceFlowsInput) {
  const flowCore = useStableFlow(() => workspaceFlowCore(input));
  const opening = useOpeningFlows(flowCore, input);
  const running = useRunningFlows(flowCore, input, opening);

  return { flowCore, ...opening, ...running };
}

export type WorkspaceFlows = ReturnType<typeof useWorkspaceFlows>;
