import type { LocalSurfaceId } from "@/features/home/ui/LocalSurfaceRailActions";
import { confirmReload } from "../../../model/app-lifecycle";
import type { WorkspaceStore } from "../../store/types";
import { navigateSessionList, type SessionListDeps } from "../tabs/session-list-navigation";
import { openBoardCard } from "./board-surface";
import { type ProjectNavigationDeps, stepProject } from "./project-navigation";
import {
  togglePrimarySidebar,
  toggleProjectRail,
  toggleSessionSidebar,
  toggleSessionSidebarShortcut,
} from "./sidebar-toggles";

export type NavigationActionsDeps = {
  store: WorkspaceStore;
  insetLayout(): boolean;
  rightPanelToggle(): (() => void) | null;
  hasDirtyFiles(): boolean;
  reload(): void;
  sessionList: SessionListDeps & { navigationIds: { current: readonly string[] } };
  project: ProjectNavigationDeps;
  openLocalSurface(surface: LocalSurfaceId): void;
};

/** Sidebar toggles, reload and session/project/board navigation bound to `deps`, created once for the workspace. */
export function createNavigationActions(deps: NavigationActionsDeps) {
  const { store } = deps;

  return {
    toggleSessionSidebar: () => toggleSessionSidebar(store),
    toggleSidebar: () => togglePrimarySidebar(store, deps.insetLayout()),
    toggleSessionSidebarShortcut: () =>
      toggleSessionSidebarShortcut(store, deps.insetLayout(), deps.rightPanelToggle()),
    toggleProjectRail: () => toggleProjectRail(store),
    reload: () => {
      void (async () => {
        if (!(await confirmReload(deps.hasDirtyFiles()))) return;
        deps.reload();
      })();
    },
    setSessionNavigationOrder: (ids: readonly string[]) => {
      deps.sessionList.navigationIds.current = ids;
    },
    navigateSessionList: (delta: number, inCurrentTab = false) =>
      navigateSessionList(deps.sessionList, delta, inCurrentTab),
    navigateProjectList: (delta: number) => stepProject(deps.project, delta),
    openBoardCard: (cardId: string) => openBoardCard(deps.openLocalSurface, cardId),
    openUsage: () => deps.openLocalSurface("usage"),
  };
}
