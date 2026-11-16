import type { WorkspaceHandlers } from "../handlers/workspace-handlers";

/** The title bar's callbacks, all taken from the workspace's action objects. */
export function titleBarHandlerProps(h: WorkspaceHandlers, notesEnabled: boolean) {
  return {
    onGoBack: h.surfaces.railBack,
    onGoForward: h.surfaces.railForward,
    onToggleSidebar: h.navigation.toggleSidebar,
    onToggleSessionSidebar: h.navigation.toggleSessionSidebar,
    onSelect: h.displayedTabs.selectTitleTab,
    onNewTerminal: h.terminals.openNew,
    onOpenSettings: h.surfaces.openSettingsHome,
    onOpenInbox: h.surfaces.openInbox,
    onOpenNotes: notesEnabled ? h.surfaces.openNotes : undefined,
    onClose: h.displayedTabs.closeDisplayedTab,
    onCloseMany: h.displayedTabs.closeDisplayedTabs,
    onCloseAll: h.displayedTabs.closeAllDisplayedTabs,
    onArchiveTab: h.history.archiveTitleTab,
    onDeleteTab: h.history.deleteTitleTab,
    onReorder: h.displayedTabs.reorderDisplayedTabs,
    onPlaceOnPane: h.tabs.placeTab,
    onPinFile: h.files.pin,
    onSelectProject: h.projects.select,
  };
}
