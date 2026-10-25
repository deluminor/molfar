import {
  rememberRemotePendingWorktree,
  rememberRemoteSession,
  remotePendingWorktree,
  remoteSessionFor,
} from "@/features/connections/model/connections";
import { isBlankSession } from "@/features/projects/model/project-return";
import { looksLikeProject, rememberProject, sameProjectPath } from "@/features/projects/model/recents";
import { keepSessionChanges, notifyReviewChanged } from "@/features/sessions/model/checkpoint";
import { newSession, retargetSessionToProject } from "@/features/sessions/model/session";
import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";
import { removeTabFromGroup, tabGroupProject } from "@/features/workspace/model/tab-groups";
import { projectName } from "@/shared/lib/paths";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import type { WorktreeDeps } from "./worktree-deps";

/**
 * The session's project just moved in place; a group only holds tabs that
 * share one project, so the tab drops out if it no longer matches.
 */
function leaveMismatchedGroup(
  deps: WorktreeDeps,
  prev: WorkspaceTab[],
  sessionId: string,
  project: string,
): WorkspaceTab[] {
  const tab = prev.find((t) => leafIds(t.layout).includes(sessionId));
  // The tab's visible project follows its focused pane; a background
  // pane changing project doesn't change what the group check should see.
  if (!tab?.groupId || tab.focusedId !== sessionId) return prev;
  const newProject = projectName(project);
  const othersProject = tabGroupProject(
    prev.filter((t) => t.id !== tab.id),
    tab.groupId,
    deps.projectOfTab,
  );
  return othersProject && newProject && othersProject !== newProject
    ? removeTabFromGroup(prev, tab.id)
    : prev;
}

/**
 * Moves a session to another project folder. Threads stay bound to their
 * project: switching from the composer opens a new tab instead of
 * retargeting the conversation.
 */
export function changeSessionProject(deps: WorktreeDeps, sessionId: string, cwd: string): void {
  const { setProjectCwd, setRecents } = deps.store.getState();
  const normalized = normalizeProjectPath(cwd);
  const current = deps.sessionsRef.current.find((s) => s.id === sessionId);
  const previous = current?.cwd;
  const moved = !!previous && !sameProjectPath(previous, normalized);

  if (current && previous && looksLikeProject(previous) && moved && !isBlankSession(current)) {
    setProjectCwd(normalized);
    setRecents(rememberProject(normalized));
    const session = newSession(
      current.harness,
      normalized,
      current.model,
      current.runtimeMode,
      current.modelSettings,
    );
    const tab = deps.openSessionTab(session, normalized);
    deps.selectTab(tab.id);
    deps.focusComposer();
    return;
  }

  if (moved) {
    // Clear bindings left by older versions before reusing a local shell.
    if (remoteSessionFor(sessionId)) rememberRemoteSession(sessionId);
    if (remotePendingWorktree(sessionId)) rememberRemotePendingWorktree(sessionId);
  }
  if (moved && previous !== "~") void keepSessionChanges(sessionId, previous).catch(() => undefined);
  setProjectCwd(normalized);
  setRecents(rememberProject(normalized));
  deps.setSessions((prev) =>
    prev.map((s) => {
      if (s.id !== sessionId) return s;
      // A blank session moving into a project adopts its provider defaults;
      // a conversation keeps its own provider.
      const base = isBlankSession(s) ? retargetSessionToProject(s, normalized) : s;
      return {
        ...base,
        cwd: normalized,
        branch: undefined,
        worktreeCwd: undefined,
        worktreeRemoved: undefined,
        workspaceMode: undefined,
        worktreeBase: undefined,
      };
    }),
  );
  deps.setTabs((prev) => leaveMismatchedGroup(deps, prev, sessionId, normalized));
  notifyReviewChanged(sessionId);
}
