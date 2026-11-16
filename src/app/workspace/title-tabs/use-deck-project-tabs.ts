import { useMemo } from "react";
import type { Session } from "@/domain/session/session";
import { sameProjectPath } from "@/features/projects/model/recents";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import {
  filterTabsForProject,
  workspaceTabCwd,
} from "@/features/workspace/model/workspace-tab-groups";

type DeckProjectTabsInput = {
  tabs: WorkspaceTab[];
  activeTabId: string;
  sessions: Session[];
  projectCwd: string;
  /** The project's focused worktree, if any. */
  worktreePath: string | undefined;
  tabWorkspace: (tab: WorkspaceTab, sessions: readonly Session[]) => string | null | undefined;
  /** Moves whenever a workspace switch lands, so the deck follows it. */
  navigationRevision: number;
};

/** The tabs of the current project and worktree, as the title bar and tab stepping see them. */
export function useDeckProjectTabs({
  tabs,
  activeTabId,
  sessions,
  projectCwd,
  worktreePath,
  tabWorkspace,
  navigationRevision,
}: DeckProjectTabsInput): WorkspaceTab[] {
  return useMemo(() => {
    // A projectless session belongs to no project, so it stands on its own
    // rather than trailing the last project's tabs.
    const active = tabs.find((tab) => tab.id === activeTabId);
    if (active && !workspaceTabCwd(active, sessions)) return [active];
    // Each worktree keeps its own tabs; the others stay open, just hidden.
    const worktree = worktreePath ?? projectCwd;
    return filterTabsForProject(tabs, sessions, projectCwd).filter((tab) => {
      if (tab.id === activeTabId) return true;
      const workspace = tabWorkspace(tab, sessions);
      return !workspace || sameProjectPath(workspace, worktree);
    });
  }, [
    activeTabId,
    tabs,
    sessions,
    projectCwd,
    worktreePath,
    tabWorkspace,
    navigationRevision,
  ]);
}
