import { useCallback, useRef, useState } from "react";
import type { Session } from "@/domain/session/session";
import {
  isRemoteProjectPath,
  sameProjectPath,
} from "@/features/projects/model/recents";
import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";
import {
  workspaceTabCwd,
  workspaceTabWorktree,
} from "@/features/workspace/model/workspace-tab-groups";

/** Which workspace each tab belongs to, and which tabs a saved layout keeps. */
export function useWorkspacePins(
  tabs: WorkspaceTab[],
  sessions: Session[],
  sessionsRef: { readonly current: Session[] },
) {
  /** Tab or session id -> the workspace it was opened or moved in. A tab
   * belongs to the workspace it was opened in, whatever worktree it runs in:
   * opening a session, or moving one from its composer, never switches the
   * workspace. Unpinned tabs (restored ones) group by their own worktree. */
  // Only the default workspace's tabs were saved, so every restored tab
  // belongs to it, including one its composer moved to a worktree.
  const [restoredPins] = useState(
    () =>
      new Map(
        tabs.flatMap((tab) => {
          const project = workspaceTabCwd(tab, sessions);
          return project && !isRemoteProjectPath(project)
            ? [[tab.id, project] as const]
            : [];
        }),
      ),
  );
  const workspacePins = useRef(restoredPins);
  const tabWorkspace = useCallback(
    (tab: WorkspaceTab, list: readonly Session[]) => {
      const pinnedTab = workspacePins.current.get(tab.id);
      if (pinnedTab) return pinnedTab;
      for (const id of leafIds(tab.layout)) {
        const pinned = workspacePins.current.get(id);
        if (pinned) return pinned;
      }
      return workspaceTabWorktree(tab, list);
    },
    [],
  );

  /** Saved tabs: the app reopens on each project's default workspace, so
   * tabs from other worktrees close with it instead of piling up. */
  const keepWorkspaceTab = useCallback(
    (tab: WorkspaceTab) => {
      const project = workspaceTabCwd(tab, sessionsRef.current);
      if (!project || isRemoteProjectPath(project)) return true;
      const workspace = tabWorkspace(tab, sessionsRef.current);
      return !workspace || sameProjectPath(workspace, project);
    },
    [tabWorkspace, sessionsRef],
  );

  return { workspacePins, tabWorkspace, keepWorkspaceTab };
}
