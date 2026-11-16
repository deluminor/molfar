import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { WorkspaceStore } from "../../store/types";

/** What opening files and following them on disk reads and writes. */
export type FileDeps = {
  store: WorkspaceStore;
  sessionsRef: { readonly current: Session[] };
  tabsRef: { readonly current: WorkspaceTab[] };
  activeTabIdRef: { readonly current: string };
  /** The git root files open relative to. */
  gitCwd(): string;
  sidebarCwd(): string;
  editorNavigationToken: { current: number };
  closeFamiliarView(): void;
  insertBesideActive(tabs: WorkspaceTab[], tab: WorkspaceTab, cwd?: string): WorkspaceTab[];
  activateTab(tabId: string, paneId?: string): void;
  selectTab(tabId: string): void;
  setComposerFocused(focused: boolean): void;
};
