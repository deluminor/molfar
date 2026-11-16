import { worktreeFocus } from "@/features/source-control/model/worktree-focus";

/** The worktree a project's workspace currently shows. */
export function currentWorkspace(project: string): string {
  return worktreeFocus(project)?.path ?? project;
}
