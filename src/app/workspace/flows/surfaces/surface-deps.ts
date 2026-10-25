import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@/domain/session/session";
import type { LocalSurfaceId } from "@/features/home/ui/LocalSurfaceRailActions";
import type { SidebarTabId } from "@/features/settings/model/appearance";
import type { AppView } from "@/features/workspace/model/app-view-tabs";
import type { SettingsReturnView } from "../../../model/settings-return/types";
import type { WorkspaceStore } from "../../store/types";

/** What opening and leaving the app's views reads and writes. */
export type SurfaceDeps = {
  store: WorkspaceStore;
  setAutomationsViewOpen(open: boolean): void;
  setAutomationsSurfaceOpen: Dispatch<SetStateAction<boolean>>;
  setLocalSurface: Dispatch<SetStateAction<LocalSurfaceId | null>>;
  automationsSurfaceOpen(): boolean;
  localSurface(): LocalSurfaceId | null;
  settingsReturnView: { current: SettingsReturnView };
  rememberAppView(view: AppView): void;
  cancelNavigation(): void;
  closeFamiliarView(): void;
  setSidebarTab(tab: SidebarTabId, project?: string): void;
  setComposerFocused(focused: boolean): void;
  visitBack(): void;
  visitForward(): void;
  ensureOpenSession(sessionId: string): Promise<Session | null | undefined>;
  selectHistorySession(sessionId: string): Promise<unknown>;
};

/** Leaves the search, inbox, notes and automations views. */
export function closeOverlays(deps: SurfaceDeps): void {
  const { setSearchViewOpen, setInboxViewOpen, setNotesViewOpen } = deps.store.getState();
  setSearchViewOpen(false);
  setInboxViewOpen(false);
  setNotesViewOpen(false);
  deps.setAutomationsViewOpen(false);
}
