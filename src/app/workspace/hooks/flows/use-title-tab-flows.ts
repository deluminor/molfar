import { createRemoteSnapshotSync } from "../../flows/remote-sessions/remote-snapshot";
import { type NavigationActionsDeps, createNavigationActions } from "../../flows/surfaces/navigation-actions";
import { openAppView } from "../../flows/surfaces/overlay-views";
import type { ProjectNavigationDeps } from "../../flows/surfaces/project-navigation";
import { createDisplayedTabs } from "../../title-tabs/displayed-tabs";
import type { DisplayedTabsDeps, VisibleTabs } from "../../title-tabs/displayed-tabs-deps";
import { createVisibleTabShortcuts } from "../../title-tabs/visible-tab-shortcuts";
import { useStableFlow } from "../use-stable-flow";
import type { ProjectFlows } from "./use-project-flows";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import type { SurfaceFlows } from "./use-surface-flows";
import type { TabFlows } from "./use-tab-flows";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

export type TitleTabFlowsInput = Pick<
  DisplayedTabsDeps,
  "navigation" | "setOpenAppViews" | "setOpenFamiliarTabs" | "setTitleTabOrder"
> &
  Pick<NavigationActionsDeps, "openLocalSurface"> &
  Pick<SessionOpenerFlows, "sessionList" | "tabActions"> &
  Pick<SurfaceFlows, "surfaceDeps"> & {
    tabFlows: TabFlows;
    projectActions: Pick<ProjectFlows["projectActions"], "select">;
    noteProjectStep: ProjectNavigationDeps["noteStep"];
    rightPanelToggleRef: { readonly current: (() => void) | null };
    visibleTabsRef: { readonly current: VisibleTabs };
  };

export function createTitleTabFlows(core: WorkspaceFlowCore, input: TitleTabFlowsInput) {
  const { store } = core;
  const { tabLayout, tabClose, newSessions } = input.tabFlows;
  const { tabActions } = input;

  const navigation = createNavigationActions({
    store,
    insetLayout: () => core.insetLayoutRef.current,
    rightPanelToggle: () => input.rightPanelToggleRef.current,
    hasDirtyFiles: () => store.getState().dirtyFiles.size > 0,
    reload: () => window.location.reload(),
    sessionList: input.sessionList,
    project: {
      currentProject: () => core.projectCwdRef.current,
      selectProject: input.projectActions.select,
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
    openAppView: (view) => openAppView(input.surfaceDeps, view),
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
  const visibleTabShortcuts = createVisibleTabShortcuts(displayedTabsDeps, displayedTabs);

  const remoteSnapshot = createRemoteSnapshotSync(core.setSessions);

  return { navigation, displayedTabs, visibleTabShortcuts, remoteSnapshot };
}

export type TitleTabFlows = ReturnType<typeof createTitleTabFlows>;

/** Sidebar and project navigation, the displayed title tabs and their shortcuts, created once. */
export function useTitleTabFlows(core: WorkspaceFlowCore, input: TitleTabFlowsInput): TitleTabFlows {
  return useStableFlow(() => createTitleTabFlows(core, input));
}
