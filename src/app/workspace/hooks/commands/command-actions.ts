import type { WorkspaceHandlers } from "../../handlers/workspace-handlers";
import type { WorkspaceActions } from "./command-deps";

/** The workspace actions shortcuts and menu commands run, from the workspace's action objects. */
export function commandActions(h: WorkspaceHandlers): WorkspaceActions {
  const visible = h.visibleTabs;

  return {
    onNewFocused: h.newSessions.newFocused,
    onArchiveFocusedSession: h.history.archiveFocused,
    onCloseOtherTabs: visible.closeOtherVisibleTabs,
    onCloseAllTabs: visible.closeAllVisibleTabs,
    onCloseFocused: visible.closeVisibleTab,
    onNext: () => visible.cycleVisibleTab(1),
    onPrev: () => visible.cycleVisibleTab(-1),
    onVisitBack: h.tabs.visitBack,
    onVisitForward: h.tabs.visitForward,
    onActivate: visible.activateVisibleTab,
    onSplit: h.newSessions.split,
    onFocusDir: h.tabs.focusDir,
    onToggleSidebar: h.navigation.toggleSidebar,
    onToggleSessionSidebar: h.navigation.toggleSessionSidebarShortcut,
    onToggleFamiliar: h.familiars.toggle,
    onGoToFile: h.surfaces.goToFile,
    onOpenCommandPalette: h.surfaces.openCommandPalette,
    onReload: h.navigation.reload,
    onFindInProject: h.surfaces.findInProject,
    onOpenSearch: h.surfaces.openSearch,
    onOpenInbox: h.surfaces.openInbox,
    onOpenNotes: h.surfaces.openNotes,
    pickProject: h.projects.pick,
    onNewTerminal: h.terminals.openNew,
    onNewTerminalTab: h.terminals.openNewTab,
    onToggleProjectTerminal: h.terminals.toggleDock,
    onNavigateSessionList: h.navigation.navigateSessionList,
    onNavigateProjectList: h.navigation.navigateProjectList,
    openSettings: h.surfaces.openSettings,
    onOpenApprovalSession: h.workerPanes.openSession,
    onOpenBoardCard: h.navigation.openBoardCard,
  };
}
