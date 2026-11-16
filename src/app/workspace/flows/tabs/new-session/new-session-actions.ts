import type { Session } from "@/domain/session/session";
import { rememberRemoteSession } from "@/features/connections/model/connections";
import { findRemoteSessionTab } from "@/features/connections/model/remote-session-tabs";
import { sameProjectPath } from "@/features/projects/model/recents";
import { newDefaultSession } from "@/features/sessions/model/session";
import type { WorktreeFocus } from "@/features/source-control/model/worktree-focus";
import type { SplitDir, WorkspaceTab } from "@/features/workspace/model/layout";
import { newWorkspaceSession } from "../../../../model/new-workspace-session";
import type { WorkspaceStore } from "../../../store/types";
import type { TerminalActions } from "../../terminals/terminal-actions";
import { splitFocusedPane } from "../tab-layout";

export type NewSessionDeps = {
  store: WorkspaceStore;
  tabsRef: { readonly current: WorkspaceTab[] };
  sessionsRef: { readonly current: Session[] };
  /** The focused session (or the first one) as last rendered; new sessions inherit its settings. */
  defaults(): Session | undefined;
  activeTab(): WorkspaceTab | undefined;
  sidebarCwd(): string;
  projectCwd(): string;
  setAutomationsViewOpen(open: boolean): void;
  openSessionTab(session: Session, cwd: string): WorkspaceTab;
  activateTab(tabId: string, paneId?: string): void;
  selectTab(tabId: string): void;
  setComposerFocused(focused: boolean): void;
  closeFamiliarView(): void;
  terminals: Pick<TerminalActions, "focusedDockTerminal" | "openNew" | "close">;
  closePane(): void;
};

/** New chats in tabs and panes, remote session tabs and the ⌘T / ⌘W targets, created once for the workspace. */
export function createNewSessionActions(deps: NewSessionDeps) {
  const runtimeMode = () => deps.defaults()?.runtimeMode;
  const leaveViews = () => {
    const { setSearchViewOpen, setInboxViewOpen, setNotesViewOpen } = deps.store.getState();
    setSearchViewOpen(false);
    setInboxViewOpen(false);
    setNotesViewOpen(false);
    deps.setAutomationsViewOpen(false);
  };

  const newSession = () => {
    leaveViews();
    const cwd = deps.sidebarCwd();
    const session = newWorkspaceSession(cwd, runtimeMode());
    const tab = deps.openSessionTab(session, cwd);
    deps.selectTab(tab.id);
    deps.setComposerFocused(true);
    return session.id;
  };

  return {
    newSession,
    createTab: (cwd: string, focus?: WorktreeFocus) => {
      const session = {
        ...newDefaultSession(cwd, runtimeMode()),
        ...(focus && !sameProjectPath(focus.path, cwd)
          ? { worktreeCwd: focus.path, branch: focus.branch ?? undefined }
          : {}),
      };
      return deps.openSessionTab(session, cwd).id;
    },
    selectRemoteSession: (project: string, remoteSessionId: string) => {
      leaveViews();
      const existing = findRemoteSessionTab(deps.tabsRef.current, deps.sessionsRef.current, project, remoteSessionId);
      if (existing) {
        deps.activateTab(existing.tab.id, existing.shellId);
        return;
      }

      // Reserve a dedicated tab immediately. An apparently blank remote tab
      // may hold composer text or a create/upload that the host has not accepted.
      const session = newDefaultSession(project, runtimeMode());
      rememberRemoteSession(session.id, remoteSessionId);
      const tab = deps.openSessionTab(session, project);
      deps.selectTab(tab.id);
    },
    split: (dir: SplitDir) => {
      deps.closeFamiliarView();
      const activeTab = deps.activeTab();
      if (!activeTab) return;

      const session = newDefaultSession(deps.defaults()?.cwd ?? deps.projectCwd(), runtimeMode());
      splitFocusedPane(deps.store, activeTab.id, dir, session);
      deps.setComposerFocused(true);
    },
    newFocused: () => {
      if (deps.terminals.focusedDockTerminal()) deps.terminals.openNew();
      else newSession();
    },
    closeFocused: () => {
      const fileId = deps.terminals.focusedDockTerminal();
      if (fileId) deps.terminals.close(fileId);
      else deps.closePane();
    },
  };
}
