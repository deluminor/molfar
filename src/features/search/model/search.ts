import { invokeWorkspace } from "@/platform/tauri/fs";
import { invoke } from "@tauri-apps/api/core";
import { isLocalProject } from "@/features/projects/model/recents";
import { pathKey, slash } from "@/shared/lib/paths";
import type {
  ProjectSearchOptions,
  ProjectSearchResult,
} from "@/domain/search/project-search";

export type EditorNavigation = {
  line: number;
  column?: number;
};

export type EditorNavigationTarget = EditorNavigation & {
  path: string;
  token: number;
};

export type FileOpenOptions = {
  /** The caller obtained this concrete path from the filesystem or file index. */
  exact?: boolean;
  /** Open as a permanent tab instead of the pane's preview tab. */
  pin?: boolean;
};

export type OpenFileFn = (
  path: string,
  navigation?: EditorNavigation,
  options?: FileOpenOptions,
) => void;

export function normalizeEditorPath(path: string): string {
  return slash(path).replace(/\/+$/, "") || path;
}

export function editorPathsEqual(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

export function searchProject(
  options: ProjectSearchOptions,
): Promise<ProjectSearchResult> {
  return invokeWorkspace<ProjectSearchResult>("search_project", { options });
}

export function cancelProjectSearch(
  cwd: string,
  searchId: string,
): Promise<void> {
  // Remote results are discarded by the caller; hosts do not yet expose
  // cancellation for workspace search. Never route their paths to local IPC.
  if (!isLocalProject(cwd)) return Promise.resolve();
  return invoke<void>("cancel_project_search", { cwd, searchId });
}
