import { createRemoteSnapshotSync } from "../../flows/remote-sessions/remote-snapshot";
import { type NavigationActionsDeps, createNavigationActions } from "../../flows/surfaces/navigation-actions";
import { openAppView } from "../../flows/surfaces/overlay-views";
import type { ProjectNavigationDeps } from "../../flows/surfaces/project-navigation";
import { createDisplayedTabs } from "../../title-tabs/displayed-tabs";
import type { DisplayedTabsDeps, VisibleTabs } from "../../title-tabs/displayed-tabs-deps";
import { createVisibleTabShortcuts } from "../../title-tabs/visible-tab-shortcuts";
import { useStableFlow } from "../use-stable-flow";
import type { WorkspaceFlowCore } from "./workspace-flow-core";
import {
  createWorkspaceHandlers,
  type OwnWorkspaceHandlers,
  type WorkspaceFlowBundles,
} from "./workspace-handlers-value";

export type TitleTabFlowsInput = Pick<
  DisplayedTabsDeps,
  "navigation" | "setOpenAppViews" | "setOpenFamiliarTabs" | "setTitleTabOrder"
> &
  Pick<NavigationActionsDeps, "openLocalSurface"> & {
    flows: WorkspaceFlowBundles;
    own: OwnWorkspaceHandlers;
    noteProjectStep: ProjectNavigationDeps["noteStep"];
    rightPanelToggleRef: { readonly current: (() => void) | null };
    visibleTabsRef: { readonly current: VisibleTabs };
  };

export function createTitleTabFlows(core: WorkspaceFlowCore, input: TitleTabFlowsInput) {
  const { store } = core;
  const { flows } = input;
  const { tabLayout, tabClose, newSessions } = flows.tab;
  const { tabActions } = flows.openers;

  const navigation = createNavigationActions({
    store,
    insetLayout: () => core.insetLayoutRef.current,
    rightPanelToggle: () => input.rightPanelToggleRef.current,
    hasDirtyFiles: () => store.getState().dirtyFiles.size > 0,
    reload: () => window.location.reload(),
    sessionList: flows.openers.sessionList,
    project: {
      currentProject: () => core.projectCwdRef.current,
      selectProject: flows.project.projectActions.select,
      noteStep: input.noteProjectStep,
    },
    openLocalSurface: (surface) => input.openLocalSurface(surface),
  });

  const displayedTabsDeps: DisplayedTabsDeps = {
    store,
    navigation: input.navigation,
    visible: () => input.visibleTabsRef.current,
    activeTabIdRef: core.activeTabIdRef,
    setOpenAppViews: input.setOpenAppViews,
    setOpenFamiliarTabs: input.setOpenFamiliarTabs,
    setTitleTabOrder: input.setTitleTabOrder,
    setAutomationsViewOpen: core.setAutomationsViewOpen,
    openFamiliar: (familiarId) => core.familiarView.open(familiarId),
    openAppView: (view) => openAppView(flows.surface.surfaceDeps, view),
    activateTab: (tabId) => tabLayout.activate(tabId),
    closeFamiliarView: () => core.familiarView.close(),
    workspace: {
      closeTitleTab: (tabId) => tabClose.closeTitleTab(tabId),
      closeTabs: (ids, fallbackId) => tabClose.closeTabs(ids, fallbackId),
      closeEveryTab: (ids) => tabClose.closeEveryTab(ids),
      reorderTabs: tabActions.reorderTabs,
      closeFocused: newSessions.closeFocused,
      next: tabActions.next,
      prev: tabActions.prev,
      activate: tabActions.activateSlot,
      closeOtherTabs: () => tabClose.closeOtherTabs(),
      closeAllTabs: () => tabClose.closeAllTabs(),
    },
  };
  const displayedTabs = createDisplayedTabs(displayedTabsDeps);

  const handlers = createWorkspaceHandlers(core, flows, input.own, {
    navigation,
    displayedTabs,
    visibleTabs: createVisibleTabShortcuts(displayedTabsDeps, displayedTabs),
    remoteSnapshot: createRemoteSnapshotSync(core.setSessions),
  });

  return { navigation, displayedTabs, handlers };
}

export type TitleTabFlows = ReturnType<typeof createTitleTabFlows>;

/** Sidebar and project navigation, the displayed title tabs and the Workspace handlers value, created once. */
export function useTitleTabFlows(core: WorkspaceFlowCore, input: TitleTabFlowsInput): TitleTabFlows {
  return useStableFlow(() => createTitleTabFlows(core, input));
}
