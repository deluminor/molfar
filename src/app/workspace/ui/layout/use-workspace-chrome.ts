import { IS_MAC } from "@/shared/lib/platform";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { type WorkspaceChrome, type WorkspaceChromeInput, workspaceChrome } from "./workspace-chrome";

type LocalInput = Pick<
  WorkspaceChromeInput,
  | "insetLayout"
  | "automationsViewOpen"
  | "rightPanelOpen"
  | "rightPanelClosing"
  | "activeAppView"
  | "sidebarCwd"
>;

/** The window chrome's layout flags, from the store's open views and rail state. */
export function useWorkspaceChrome(store: WorkspaceStore, input: LocalInput): WorkspaceChrome {
  const searchViewOpen = useWorkspaceField(store, "searchViewOpen");
  const settingsOpen = useWorkspaceField(store, "settingsOpen");
  const inboxViewOpen = useWorkspaceField(store, "inboxViewOpen");
  const notesViewOpen = useWorkspaceField(store, "notesViewOpen");
  const collapsedProjectRailMode = useWorkspaceField(store, "collapsedProjectRailMode");
  const projectRailOpen = useWorkspaceField(store, "projectRailOpen");
  const familiarViewId = useWorkspaceField(store, "familiarViewId");

  return workspaceChrome({
    ...input,
    isMac: IS_MAC,
    searchViewOpen,
    settingsOpen,
    inboxViewOpen,
    notesViewOpen,
    compactProjectRail: collapsedProjectRailMode === "compact",
    projectRailOpen,
    familiarCovers: !!familiarViewId,
  });
}
