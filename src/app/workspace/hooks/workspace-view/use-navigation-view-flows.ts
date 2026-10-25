import { useRef } from "react";
import { useInboxActivity } from "@/features/inbox/hooks/use-inbox-unseen";
import { useLocalSurfaceActions } from "../../../model/local-surfaces/use-local-surface-actions";
import { noteProjectStep } from "../../../shell/Sidebar";
import { useTitleTabsView } from "../../title-tabs/use-title-tabs-view";
import { useChromeResets } from "../../ui/layout/use-chrome-resets";
import { useTitleTabFlows } from "../flows/use-title-tab-flows";
import { useInboxView } from "../inbox/use-inbox-view";
import { useSidebarHistoryView } from "../sidebar/use-sidebar-history-view";
import type { WorkspaceViewFlowsInput } from "./types";

/** Title tabs, the sidebar's history and inbox views, local surface actions and the title tab flows. */
export function useNavigationViewFlows(input: WorkspaceViewFlowsInput) {
  const { core, flows, inbox, turnActions, unseenFinishedIds, promptableSessions, projectBranches } = input;
  const { workspaceStore, sessions, sessionsRef, dirtyFiles, insetLayout, openAppViews, notesEnabled } = core;
  const { shownFamiliarTabs, titleTabOrder, settingsOpen, familiarViewId, familiarsSnap, activeAppView } = core;
  const { activeTabId, tabProjectsRef, history, orchestrationRuns, recents, storedLinkedSessions } = core;
  const { localSurfaces, setFilePickerOpen, setSettingsOpen, setSearchViewOpen, setInboxViewOpen } = core;
  const { setNotesViewOpen, displayedTabNavigation, setOpenAppViews, setOpenFamiliarTabs, setTitleTabOrder } = core;
  const { visibleTabsRef, currentProjectDock } = core;
  const { flowCore, deckProjectTabs, railBadges, tabFlows, openerFlows, surfaceFlows, historyFlows } = flows;
  const { projectFlows, submissionFlows, turnQueueFlows, orchestrationFlows } = flows;
  const { sessionOpeners } = openerFlows;
  const { automationRuns } = submissionFlows;
  const { btw, inboxActions, linkedPanels, linkedUpdateCards } = inbox;
  const { sidebarTab, setSidebarTab } = input.sidebar;
  const { sidebarCwd, appViewScope } = input.cwds;

  const titleTabsView = useTitleTabsView({
    deckProjectTabs,
    sessions,
    dirtyFiles,
    unseenFinishedIds,
    insetLayout,
    openAppViews,
    notesEnabled,
    shownFamiliarTabs,
    sidebarCwd,
    titleTabOrder,
    settingsOpen,
    familiarViewId,
    familiarsSnap,
    activeAppView,
    activeTabId,
    tabProjectsRef,
  });
  const { titleTabs } = titleTabsView;

  const histories = useSidebarHistoryView({
    history,
    promptableSessions,
    sidebarCwd,
    projectBranches,
    orchestrationRuns,
  });
  const inboxActivity = useInboxActivity(recents, sidebarCwd, histories.sidebarHistory, {
    onAppeared: automationRuns.inboxAppeared,
    scopeProject: appViewScope,
  });
  inbox.linkedUpdatesRef.current = inboxActivity.linkedSessionUpdates;
  const inboxView = useInboxView(storedLinkedSessions, history, sessions);
  const rightPanelToggleRef = useRef<(() => void) | null>(null);
  const localSurfaceActions = useLocalSurfaceActions({
    surfaces: localSurfaces,
    setFilePickerOpen,
    setSettingsOpen,
    setSearchViewOpen,
    setInboxViewOpen,
    setNotesViewOpen,
    setSidebarTab,
    sessionsRef,
    history,
    onSelectHistorySession: sessionOpeners.selectHistory,
    railBadges,
  });
  const titleTabFlows = useTitleTabFlows(flowCore, {
    navigation: displayedTabNavigation,
    setOpenAppViews,
    setOpenFamiliarTabs,
    setTitleTabOrder,
    openLocalSurface: (surface) => localSurfaceActions.onOpenLocalSurface(surface),
    flows: {
      tab: tabFlows,
      openers: openerFlows,
      surface: surfaceFlows,
      history: historyFlows,
      project: projectFlows,
      submission: submissionFlows,
      turnQueue: turnQueueFlows,
      orchestration: orchestrationFlows,
    },
    own: { btw, turns: turnActions, inbox: inboxActions, linkedPanels, linkedUpdateCards },
    noteProjectStep,
    rightPanelToggleRef,
    visibleTabsRef,
  });

  const { displayedTabs } = titleTabFlows;

  useChromeResets({
    store: workspaceStore,
    sidebarTab,
    setSidebarTab,
    dockVisible: !!currentProjectDock?.open,
  });

  displayedTabNavigation.current = {
    tabs: insetLayout ? titleTabs : [],
    activeId: titleTabsView.displayedActiveId,
    select: displayedTabs.selectTitleTab,
  };
  visibleTabsRef.current = titleTabsView.visibleTabs;

  return { titleTabFlows, titleTabs, histories, inboxActivity, inboxView, localSurfaceActions, rightPanelToggleRef };
}
