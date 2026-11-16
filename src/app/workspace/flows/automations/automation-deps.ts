import type { Dispatch, SetStateAction } from "react";
import type { Attachment } from "@/domain/session/attachment";
import type { Session } from "@/domain/session/session";
import type { SidebarTabId } from "@/features/settings/model/appearance";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { WorkspaceStore } from "../../store/types";
import type { Submit } from "../submission/submit-types";

/** What automation runs and quick launches open sessions through. */
export type AutomationDeps = {
  store: WorkspaceStore;
  sessionsRef: { current: Session[] };
  setSessions: Dispatch<SetStateAction<Session[]>>;
  tabsRef: { current: WorkspaceTab[] };
  appendTab(tab: WorkspaceTab, cwd?: string): void;
  selectTab(tabId: string): void;
  setComposerFocused(focused: boolean): void;
  focusOpenSession(sessionId: string): unknown;
  setSidebarTab(tab: SidebarTabId, project?: string): void;
  closeAutomations(): void;
  submitSession: Submit;
  saveDraft(sessionId: string, text: string, attachments?: Attachment[], appRequestId?: string): boolean;
};

/** Leaves the overlay views for the sessions sidebar of `cwd`. */
export function revealSessions(deps: AutomationDeps, cwd: string): void {
  const { setSearchViewOpen, setInboxViewOpen, setNotesViewOpen } = deps.store.getState();
  setSearchViewOpen(false);
  setInboxViewOpen(false);
  setNotesViewOpen(false);
  deps.closeAutomations();
  deps.setSidebarTab("sessions", cwd);
}
