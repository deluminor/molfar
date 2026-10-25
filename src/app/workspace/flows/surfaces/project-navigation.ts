import { loadRecents, projectRailItems, sameProjectPath } from "@/features/projects/model/recents";
import { adjacentItemId } from "@/features/workspace/model/tab-keys";
import { normalizeProjectPath } from "@/shared/lib/project-path";

export type ProjectNavigationDeps = {
  currentProject(): string;
  selectProject(path: string): void;
  noteStep(path: string, delta: number): void;
};

/** Steps to the next/previous project in the rail's order. */
export function stepProject(deps: ProjectNavigationDeps, delta: number): void {
  const current = normalizeProjectPath(deps.currentProject());
  const ids = projectRailItems(loadRecents(), current).map((project) => project.path);
  const next = adjacentItemId(ids, current, delta);
  if (!next || sameProjectPath(next, current)) return;

  deps.noteStep(next, delta);
  deps.selectProject(next);
}
