import { isFilesystemTab, type WorkspaceTab } from "./layout";

/** The files open in any pane of any tab, each path once, in tab order. */
export function openFilePaths(tabs: readonly WorkspaceTab[]): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const tab of tabs) {
    for (const pane of tab.editorPanes) {
      for (const file of pane.files) {
        if (!isFilesystemTab(file) || seen.has(file.path)) continue;
        seen.add(file.path);
        paths.push(file.path);
      }
    }
  }
  return paths;
}
