import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@/domain/session/session";
import type { ProjectReturnMemory } from "@/features/projects/model/project-return";
import type { ProjectTerminalDock } from "@/features/projects/model/project-terminal";
import type { SidebarTabId } from "@/features/settings/model/appearance";
import type { WorktreeFocus } from "@/features/source-control/model/worktree-focus";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { WorkspaceStore } from "../../store/types";
import type { SessionPersistence } from "../session-history/session-persistence";

export type SidebarTabSelection = { project: string; tab: SidebarTabId };

/** What opening, archiving and moving projects reads and writes. */
export type ProjectDeps = {
  store: WorkspaceStore;
  sessionsRef: { current: Session[] };
  setSessions: Dispatch<SetStateAction<Session[]>>;
  tabsRef: { current: WorkspaceTab[] };
  activeTabIdRef: { current: string };
  projectCwdRef: { current: string };
  projectTerminalsRef: { current: ProjectTerminalDock[] };
  turnGen: { readonly current: Map<string, number> };
  loadedSessionCache: { readonly current: Map<string, Session> };
  loadingSessionIds(): Iterable<string>;
  invalidateLoadedSession(sessionId: string): void;
  persistence: Pick<SessionPersistence, "dropPending" | "forgetSaved" | "mapPending" | "persist">;
  setSidebarTabSelection: Dispatch<SetStateAction<SidebarTabSelection>>;
  sidebarCwd(): string;
  closeAutomations(): void;
  closeFamiliarView(): void;
  navigation: {
    cancel(): void;
    selectProject(path: string): void;
    selectWorkspace(project: string, focus?: WorktreeFocus): void;
  };
  readProjectReturnMemory(): ProjectReturnMemory;
  activateTab(tabId: string, paneId?: string): void;
  insertBeside(tabs: WorkspaceTab[], tab: WorkspaceTab, besideTabId: string | undefined, cwd: string): WorkspaceTab[];
  /** Moves a session to another project folder (a blank one adopts it). */
  changeSessionProject(sessionId: string, cwd: string): void;
  selectTab(tabId: string): void;
  focusComposer(): void;
  /** Rebases open file tabs from one path to another. */
  fileMoved(from: string, to: string): void;
};
