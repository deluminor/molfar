import { saveProjectRailOpen, saveSessionSidebarOpen } from "@/features/settings/model/appearance";
import type { WorkspaceStore } from "../../store/types";

export function toggleSessionSidebar(store: WorkspaceStore): void {
  const next = !store.getState().sessionSidebarOpen;
  saveSessionSidebarOpen(next);
  store.getState().setSessionSidebarOpen(next);
}

export function toggleProjectRail(store: WorkspaceStore): void {
  const next = !store.getState().projectRailOpen;
  saveProjectRailOpen(next);
  store.getState().setProjectRailOpen(next);
}

/** The inset layout has no project rail, so its sidebar takes the primary toggle. */
export function togglePrimarySidebar(store: WorkspaceStore, insetLayout: boolean): void {
  if (insetLayout) toggleSessionSidebar(store);
  else toggleProjectRail(store);
}

/**
 * The inset layout's sidebar already answers the primary toggle, so the
 * session sidebar's shortcut takes the right panel instead.
 */
export function toggleSessionSidebarShortcut(
  store: WorkspaceStore,
  insetLayout: boolean,
  toggleRightPanel: (() => void) | null,
): void {
  if (!insetLayout) {
    toggleSessionSidebar(store);
    return;
  }
  toggleRightPanel?.();
}
