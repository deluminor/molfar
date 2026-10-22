import { useNotesEnabled } from "@/features/settings/hooks/use-notes-enabled";
import { MenuBar } from "../../../shell/MenuBar";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { zoomUi } from "../../hooks/commands/ui-zoom";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = {
  store: WorkspaceStore;
};

const zoomIn = () => zoomUi("zoom-in");
const zoomOut = () => zoomUi("zoom-out");
const zoomReset = () => zoomUi("zoom-reset");

/** The in-window menu bar, for platforms without a native one. */
export function WorkspaceMenuBar({ store }: Props) {
  const notesEnabled = useNotesEnabled();
  const activeTabId = useWorkspaceField(store, "activeTabId");
  const { newSessions, terminals, surfaces, navigation, tabs, tabClose, projects } =
    useWorkspaceHandlers();

  return (
    <MenuBar
      onNew={newSessions.newSession}
      onNewTerminal={terminals.openNew}
      onToggleTerminal={terminals.toggleDock}
      onGoToFile={surfaces.goToFile}
      onToggleSidebar={navigation.toggleSidebar}
      onToggleSessionSidebar={navigation.toggleSessionSidebarShortcut}
      onShowSourceControl={tabs.showSourceControl}
      onCloseCurrentTab={activeTabId ? () => tabClose.closeTab(activeTabId) : undefined}
      onCloseOtherTabs={tabClose.closeOtherTabs}
      onCloseAllTabs={tabClose.closeAllTabs}
      onPickProject={projects.pick}
      onFindInProject={surfaces.findInProject}
      onSearch={surfaces.openSearch}
      onOpenInbox={surfaces.openInbox}
      onOpenNotes={notesEnabled ? surfaces.openNotes : undefined}
      onZoomIn={zoomIn}
      onZoomOut={zoomOut}
      onZoomReset={zoomReset}
    />
  );
}
