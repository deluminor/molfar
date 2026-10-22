import type { WorkspaceMode } from "@/domain/session/session";
import type { Worktree } from "@/features/source-control/model/worktrees";
import { changeBranch, changeWorkspaceMode, changeWorktreeBase } from "./session-checkout";
import { changeSessionProject } from "./session-project";
import type { WorktreeDeps } from "./worktree-deps";
import { checkRemoval, removeSessionWorktree } from "./worktree-removal";
import { changeWorktree } from "./worktree-switch";

/** A session's project, checkout and worktree flows bound to `deps`, created once for the workspace. */
export function createWorktreeActions(deps: WorktreeDeps) {
  return {
    changeProject: (sessionId: string, cwd: string) => changeSessionProject(deps, sessionId, cwd),
    changeBranch: (sessionId: string) => changeBranch(deps, sessionId),
    changeWorkspaceMode: (sessionId: string, mode: WorkspaceMode, base?: string) =>
      changeWorkspaceMode(deps, sessionId, mode, base),
    changeBase: (sessionId: string, base: string) => changeWorktreeBase(deps, sessionId, base),
    change: (sessionId: string, tree: Worktree, fromComposer = false, isCurrent: () => boolean = () => true) =>
      changeWorktree(deps, sessionId, tree, fromComposer, isCurrent),
    changeFromComposer: (sessionId: string, tree: Worktree) => changeWorktree(deps, sessionId, tree, true),
    checkRemoval: (cwd: string, path: string, force: boolean) => checkRemoval(deps, cwd, path, force),
    remove: (cwd: string, path: string, force: boolean, keepSessions = false) =>
      removeSessionWorktree(deps, cwd, path, force, keepSessions),
  };
}

export type WorktreeActions = ReturnType<typeof createWorktreeActions>;
