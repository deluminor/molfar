import type { Session } from "@/domain/session/session";
import { isRemoteProjectPath, sameProjectPath } from "@/features/projects/model/recents";
import {
  type SessionGitHint,
  summaryFromSession,
} from "@/features/sessions/data/session-history";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";
import { filterTabsForProject } from "@/features/workspace/model/workspace-tab-groups";
import { pathKey, projectName } from "@/shared/lib/paths";

export type TabWorkspace = (tab: WorkspaceTab, sessions: readonly Session[]) => string | null;

export type WorktreeTabStats = Map<string, { tabs: number; busy: boolean }>;

/** The branch and repo a project's session rows are labelled with. */
export function projectGitHint(cwd: string, branch: string | undefined): SessionGitHint {
  return {
    ...(branch ? { branch } : {}),
    ...(cwd && cwd !== "~" ? { repo: projectName(cwd) } : {}),
  };
}

/** Open tabs per workspace in the project, keyed by worktree path. */
export function worktreeTabStats(
  tabs: WorkspaceTab[],
  sessions: Session[],
  cwd: string,
  tabWorkspace: TabWorkspace,
): WorktreeTabStats {
  const stats: WorktreeTabStats = new Map();
  if (!cwd || cwd === "~" || isRemoteProjectPath(cwd)) return stats;

  for (const tab of filterTabsForProject(tabs, sessions, cwd)) {
    const key = pathKey(tabWorkspace(tab, sessions) ?? cwd);
    const entry = stats.get(key) ?? { tabs: 0, busy: false };
    entry.tabs += 1;
    entry.busy ||= leafIds(tab.layout).some(
      (id) => sessions.find((session) => session.id === id)?.busy,
    );
    stats.set(key, entry);
  }

  return stats;
}

/** The project's sessions open in this window, as sidebar rows. */
export function openProjectSessionRows(
  sessions: Session[],
  cwd: string,
  branch: string | undefined,
): SessionSummary[] {
  return sessions
    .filter(
      (session) =>
        !session.inboxAsk &&
        !session.ephemeral &&
        !session.orchestrationLeadId &&
        sameProjectPath(session.cwd, cwd),
    )
    .map((session) => summaryFromSession(session, projectGitHint(cwd, branch)));
}

/** Projects with a promptable session at work, for the rail's busy dots. */
export function busyProjectPaths(sessions: Session[]): string[] {
  return sessions.flatMap((session) =>
    !session.ephemeral && session.busy && session.cwd ? [session.cwd] : [],
  );
}
