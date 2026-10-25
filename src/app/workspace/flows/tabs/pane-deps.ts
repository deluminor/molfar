import type { Session } from "@/domain/session/session";
import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { WorkspaceStore } from "../../store/types";

/** What focusing panes and opening saved sessions in tabs reads and writes. */
export type PaneDeps = {
  store: WorkspaceStore;
  tabsRef: { current: WorkspaceTab[] };
  activeTabIdRef: { readonly current: string };
  sessionsRef: { readonly current: Session[] };
  setComposerFocused(focused: boolean): void;
  closeFamiliarView(): void;
  closeAutomations(): void;
  cancelNavigation(): void;
  activateTab(tabId: string, paneId?: string): void;
  selectTab(tabId: string): void;
  appendTab(tab: WorkspaceTab, cwd?: string): void;
  ensureOpenSession(sessionId: string): Promise<Session | null | undefined>;
  openFamiliar(familiarId: string): Promise<unknown>;
  /** Focuses the tab already showing the session; false when none does. */
  focusOpenSession(sessionId: string): boolean;
  /** Puts the session in place of a blank pane; false when there is none. */
  replaceBlankPane(session: Session): boolean;
  linkedUpdates(): ReadonlyMap<string, LinkedSessionUpdate>;
  revealLinkedUpdate(sessionId: string, update: LinkedSessionUpdate): void;
};
