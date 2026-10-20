import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@/domain/session/session";
import type { ProjectTerminalDock } from "@/features/projects/model/project-terminal";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { WorkspaceStore } from "../../store/types";
import type { SessionPersistence } from "../session-history/session-persistence";

/** What changing a session's checkout, branch or project reads and writes. */
export type WorktreeDeps = {
  store: WorkspaceStore;
  sessionsRef: { current: Session[] };
  setSessions: Dispatch<SetStateAction<Session[]>>;
  tabsRef: { readonly current: WorkspaceTab[] };
  setTabs: Dispatch<SetStateAction<WorkspaceTab[]>>;
  projectTerminals(): ProjectTerminalDock[];
  projectCwd(): string;
  removingSessionIds: { readonly current: Set<string> };
  /** Sessions selecting a worktree, by the worktree's path. */
  switchingWorktrees: { readonly current: Map<string, string> };
  removingWorktreePaths: { readonly current: Set<string> };
  workspacePins: { readonly current: Map<string, string> };
  persistence: Pick<SessionPersistence, "dropPending" | "forgetSaved" | "persist">;
  invalidateLoadedSession(sessionId: string): void;
  stopSessionForRemoval(sessionId: string): Promise<Session | undefined>;
  appendTab(tab: WorkspaceTab, cwd?: string): void;
  openSessionTab(session: Session, cwd: string): WorkspaceTab;
  selectTab(tabId: string): void;
  focusComposer(): void;
  refreshHistory(cwd: string): Promise<unknown>;
  /** The project a tab belongs to, for tab group checks. */
  projectOfTab(tabId: string): string | undefined;
};

/** Writes `next` through the sessions ref at once, then renders it. */
export function commitSessions(deps: WorktreeDeps, next: Session[]): void {
  deps.sessionsRef.current = next;
  deps.setSessions(next);
}
