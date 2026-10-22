import type { EditorNavigation, FileOpenOptions } from "@/features/search/model/search";
import type { FileDeps } from "./file-deps";
import { fileDeleted, fileMoved } from "./file-paths";
import { pinFile, selectFileSurface, setFileDirty, setFileErrorCount } from "./file-state";
import { openFile, openPlan } from "./open-file";

/** The file tab flows bound to `deps`, created once for the workspace. */
export function createFileActions(deps: FileDeps) {
  return {
    open: (path: string, navigation?: EditorNavigation, options?: FileOpenOptions) => {
      deps.closeFamiliarView();
      void openFile(deps, path, navigation, options);
    },
    openPlan: (sessionId: string, blockId: string) => openPlan(deps, sessionId, blockId),
    pin: (fileId: string) => pinFile(deps, fileId),
    setDirty: (fileId: string, dirty: boolean) => setFileDirty(deps, fileId, dirty),
    setErrorCount: (fileId: string, count: number) => setFileErrorCount(deps, fileId, count),
    selectSurface: (paneId: string, fileId: string) => selectFileSurface(deps, paneId, fileId),
    moved: (from: string, to: string) => fileMoved(deps, from, to),
    deleted: (path: string) => fileDeleted(deps, path),
  };
}

export type FileActions = ReturnType<typeof createFileActions>;
