import { type ComponentProps, useCallback } from "react";
import { Sidebar } from "../../shell/Sidebar";
import { useWorkspaceHandlers } from "../handlers/workspace-handlers";
import { type SidebarModelInput, useSidebarModel } from "../hooks/sidebar/use-sidebar-model";
import { useWorkspaceActions } from "../hooks/use-workspace-actions";
import { useWorkspaceField } from "../hooks/use-workspace-field";
import type { WorkspaceStore } from "../store/types";
import { sidebarHandlerProps } from "./sidebar-handler-props";

type SidebarProps = ComponentProps<typeof Sidebar>;

type Props = Omit<
  SidebarProps,
  | keyof ReturnType<typeof sidebarHandlerProps>
  | keyof ReturnType<typeof useSidebarModel>
  | "open"
  | "inset"
  | "rightPanel"
  | "localSurfaces"
  | "filesSearchOpen"
  | "onFilesSearchOpenChange"
  | "searchFocusToken"
  | "canGoBack"
  | "canGoForward"
  | "recents"
  | "searchActive"
  | "inboxActive"
  | "notesActive"
  | "familiarViewActive"
  | "projectRailOpen"
  | "compactProjectRail"
  | "settingsOpen"
  | "settingsSection"
  | "updateNotice"
  | "onDismissUpdate"
> &
  Omit<SidebarModelInput, "cwd"> & {
  store: WorkspaceStore;
  inset: boolean;
  automationsViewOpen: boolean;
  rightPanel: NonNullable<SidebarProps["rightPanel"]>;
  localSurfaces: NonNullable<SidebarProps["localSurfaces"]>;
};

/** The session sidebar, with its view, rail and settings state read from the store. */
export function WorkspaceSidebar({
  store,
  inset,
  automationsViewOpen,
  tab,
  rightPanel,
  localSurfaces,
  gitCwd,
  liveSessions,
  activeTab,
  activeSession,
  tabWorkspace,
  workspaceSwitch,
  unseenFamiliarReplies,
  ...passThrough
}: Props) {
  const handlers = useWorkspaceHandlers();
  const model = useSidebarModel(store, {
    cwd: passThrough.cwd,
    gitCwd,
    liveSessions,
    activeTab,
    activeSession,
    tabWorkspace,
    workspaceSwitch,
    unseenFamiliarReplies,
  });
  const sessionSidebarOpen = useWorkspaceField(store, "sessionSidebarOpen");
  const projectRailOpen = useWorkspaceField(store, "projectRailOpen");
  const collapsedProjectRailMode = useWorkspaceField(store, "collapsedProjectRailMode");
  const settingsOpen = useWorkspaceField(store, "settingsOpen");
  const settingsSection = useWorkspaceField(store, "settingsSection");
  const familiarViewId = useWorkspaceField(store, "familiarViewId");
  const filesSearchOpen = useWorkspaceField(store, "filesSearchOpen");
  const searchFocusToken = useWorkspaceField(store, "searchFocusToken");
  const searchViewOpen = useWorkspaceField(store, "searchViewOpen");
  const inboxViewOpen = useWorkspaceField(store, "inboxViewOpen");
  const notesViewOpen = useWorkspaceField(store, "notesViewOpen");
  const tabVisitNav = useWorkspaceField(store, "tabVisitNav");
  const recents = useWorkspaceField(store, "recents");
  const updateNotice = useWorkspaceField(store, "updateNotice");
  const { setFilesSearchOpen, setUpdateNotice } = useWorkspaceActions(store);
  const onDismissUpdate = useCallback(() => setUpdateNotice(null), []);
  const familiarCovers = !!familiarViewId;

  const canGoBack =
    familiarCovers ||
    tabVisitNav.canBack ||
    searchViewOpen ||
    settingsOpen ||
    inboxViewOpen ||
    notesViewOpen ||
    automationsViewOpen;

  return (
    <Sidebar
      {...passThrough}
      {...model}
      gitCwd={gitCwd}
      {...sidebarHandlerProps(handlers, passThrough.notesEnabled)}
      // The inset sidebar carries the links to the local surfaces, so it stays
      // beside them like it does beside the other views.
      open={sessionSidebarOpen && (inset || localSurfaces.active === null)}
      tab={inset ? "sessions" : tab}
      rightPanel={inset && !settingsOpen && !familiarCovers ? rightPanel : undefined}
      localSurfaces={localSurfaces}
      filesSearchOpen={filesSearchOpen}
      onFilesSearchOpenChange={setFilesSearchOpen}
      searchFocusToken={searchFocusToken}
      canGoBack={canGoBack}
      canGoForward={tabVisitNav.canForward}
      recents={recents}
      familiarViewActive={familiarCovers}
      searchActive={searchViewOpen}
      inboxActive={inboxViewOpen}
      notesActive={notesViewOpen}
      // The inset layout has no project rail: the sidebar header's menu
      // switches projects.
      projectRailOpen={!inset && projectRailOpen}
      compactProjectRail={!inset && collapsedProjectRailMode === "compact"}
      inset={inset}
      settingsOpen={settingsOpen}
      settingsSection={settingsSection}
      updateNotice={updateNotice}
      onDismissUpdate={onDismissUpdate}
    />
  );
}
