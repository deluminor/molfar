import type { Dispatch, SetStateAction } from "react";
import type { RuntimeMode } from "@/domain/session/runtime-mode";
import type { Session } from "@/domain/session/session";
import type { SidebarTabId } from "@/features/settings/model/appearance";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { WorkspaceStore } from "../../store/types";
import type { Submit } from "../submission/submit-types";

/** What inbox, notes and linked work items open chats through. */
export type InboxDeps = {
  store: WorkspaceStore;
  sessionsRef: { current: Session[] };
  setSessions: Dispatch<SetStateAction<Session[]>>;
  closeAutomations(): void;
  setSidebarTab(tab: SidebarTabId, project?: string): void;
  openSessionTab(session: Session, cwd: string): WorkspaceTab;
  selectTab(tabId: string): void;
  focusComposer(): void;
  /** Where a new chat starts by default: the active chat's project, else the workspace's. */
  defaultCwd(): string;
  runtimeMode(): RuntimeMode | undefined;
  sidebarCwd(): string;
  selectHistorySession(sessionId: string): Promise<unknown>;
  ensureOpenSession(sessionId: string): Promise<Session | null | undefined>;
  submit(...args: Parameters<Submit>): boolean;
};

/** Leaves the inbox, notes and automations views so the chat is visible. */
export function leaveOverlayViews(deps: InboxDeps): void {
  const { setInboxViewOpen, setNotesViewOpen } = deps.store.getState();
  setInboxViewOpen(false);
  setNotesViewOpen(false);
  deps.closeAutomations();
}

/** Opens `session` in a new tab of the sessions sidebar and focuses its composer. */
export function openComposerSession(deps: InboxDeps, session: Session, cwd: string): void {
  deps.setSidebarTab("sessions", cwd);
  const tab = deps.openSessionTab(session, cwd);
  deps.selectTab(tab.id);
  deps.focusComposer();
}
