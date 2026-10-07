import {
  loadArchivedProjects,
  loadRecents,
  looksLikeProject,
} from "../../projects/model/recents";
import {
  loadTabGroupLabels,
  resolveTabGroupLabel,
} from "../../workspace/model/tabGroups";
import { pathKey, projectKey, projectName } from "../../../shared/lib/paths";

/** The rail's projects, archived ones left out. */
export function companionProjectPaths(): string[] {
  const archived = new Set(
    loadArchivedProjects().map((project) => pathKey(project.path)),
  );
  return loadRecents()
    .map((project) => project.path)
    .filter((path) => looksLikeProject(path) && !archived.has(pathKey(path)));
}

/** A project's name as the rail labels it. */
export function companionProjectLabel(path: string): string {
  return resolveTabGroupLabel(projectKey(path), loadTabGroupLabels(), projectName(path));
}
