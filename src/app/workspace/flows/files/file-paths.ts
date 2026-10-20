import { invalidateProjectFiles } from "@/features/files/model/file-index";
import { isFilesystemTab } from "@/features/workspace/model/layout";
import { isEqualOrInside, rebasePath } from "@/shared/lib/paths";
import { dropOpenFiles } from "./drop-open-files";
import type { FileDeps } from "./file-deps";

/** Open file tabs follow a file or folder that moved. */
export function fileMoved(deps: Pick<FileDeps, "store">, from: string, to: string): void {
  invalidateProjectFiles();
  deps.store.getState().setTabs((prev) =>
    prev.map((tab) => ({
      ...tab,
      editorPanes: tab.editorPanes.map((pane) => ({
        ...pane,
        files: pane.files.map((file) =>
          isFilesystemTab(file) ? { ...file, path: rebasePath(file.path, from, to) } : file,
        ),
      })),
    })),
  );
}

/** Closes the tabs of a deleted file or folder and forgets their unsaved state. */
export function fileDeleted(deps: Pick<FileDeps, "store" | "tabsRef">, path: string): void {
  invalidateProjectFiles();
  const dropped = new Set<string>();
  for (const tab of deps.tabsRef.current) {
    for (const pane of tab.editorPanes) {
      for (const file of pane.files) {
        if (isFilesystemTab(file) && isEqualOrInside(file.path, path)) dropped.add(file.id);
      }
    }
  }

  const { setTabs, setDirtyFiles } = deps.store.getState();
  setTabs((prev) => prev.map((tab) => dropOpenFiles(tab, (filePath) => isEqualOrInside(filePath, path))));
  if (dropped.size === 0) return;
  setDirtyFiles((prev) => {
    const next = new Set(prev);
    for (const id of dropped) next.delete(id);
    return next;
  });
}
