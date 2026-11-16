import { rememberProject } from "@/features/projects/model/recents";
import type { SessionFolderTarget } from "@/features/sessions/model/session-folders";
import type { WorktreeFocus } from "@/features/source-control/model/worktree-focus";
import { pickProjects, selectProject, selectWorkspace } from "./open-projects";
import type { ProjectDeps } from "./project-deps";
import { moveProjectLocation } from "./project-location";
import { removeProject } from "./remove-project";
import { placeInFolder } from "./session-folder";

/** The project switching, removal and location flows bound to `deps`, created once for the workspace. */
export function createProjectActions(deps: ProjectDeps) {
  const select = (path: string) => selectProject(deps, path);

  return {
    select,
    selectWorkspace: (focus?: WorktreeFocus) => selectWorkspace(deps, focus),
    pick: () => pickProjects(deps),
    remove: (path: string, options: { purgeData: boolean }) => removeProject(deps, path, options),
    restore: (path: string) => {
      deps.store.getState().setRecents(rememberProject(path));
      select(path);
    },
    moveLocation: (from: string, to: string) => moveProjectLocation(deps, from, to),
    placeSessionInFolder: (sessionId: string, target: SessionFolderTarget) =>
      placeInFolder(deps.sessionsRef.current, sessionId, target),
  };
}

export type ProjectActions = ReturnType<typeof createProjectActions>;
