import type { RuntimeMode } from "@/domain/session/runtime-mode";
import { newDefaultSession } from "@/features/sessions/model/session";
import { worktreeFocus } from "@/features/source-control/model/worktree-focus";
import { sameProjectPath } from "@/features/projects/model/recents";

/** Session defaults can supply permissions, but the visible project owns cwd. */
export function newWorkspaceSession(
  project: string,
  runtimeMode?: RuntimeMode,
) {
  const focus = worktreeFocus(project);
  return {
    ...newDefaultSession(project, runtimeMode),
    ...(focus && !sameProjectPath(focus.path, project)
      ? { worktreeCwd: focus.path, branch: focus.branch ?? undefined }
      : {}),
  };
}
