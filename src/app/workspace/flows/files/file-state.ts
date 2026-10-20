import { findSurfacePane, pinEditorFile, surfacePanes, withSurfacePanes } from "@/features/workspace/model/layout";
import type { FileDeps } from "./file-deps";

/** Keeps a preview tab open: the next click opens beside it instead of replacing it. */
export function pinFile(deps: Pick<FileDeps, "store">, fileId: string): void {
  deps.store.getState().setTabs((prev) => {
    const next = prev.map((tab) => pinEditorFile(tab, fileId));
    return next.some((tab, index) => tab !== prev[index]) ? next : prev;
  });
}

export function setFileDirty(deps: Pick<FileDeps, "store">, fileId: string, dirty: boolean): void {
  // An edited preview must not be replaced by the next click.
  if (dirty) pinFile(deps, fileId);
  deps.store.getState().setDirtyFiles((prev) => {
    if (prev.has(fileId) === dirty) return prev;
    const next = new Set(prev);
    if (dirty) next.add(fileId);
    else next.delete(fileId);
    return next;
  });
}

/** The editor reports 0 as it unmounts, so closed tabs drop out on their own. */
export function setFileErrorCount(deps: Pick<FileDeps, "store">, fileId: string, count: number): void {
  deps.store.getState().setFileErrorCounts((prev) => {
    if ((prev.get(fileId) ?? 0) === count) return prev;
    const next = new Map(prev);
    if (count > 0) next.set(fileId, count);
    else next.delete(fileId);
    return next;
  });
}

/** Shows a file in its surface pane and focuses the pane. */
export function selectFileSurface(deps: FileDeps, paneId: string, fileId: string): void {
  deps.closeFamiliarView();
  deps.store.getState().setTabs((prev) =>
    prev.map((tab) => {
      const found = findSurfacePane(tab, paneId);
      if (!found) return tab;
      return withSurfacePanes(
        { ...tab, focusedId: paneId },
        found.kind,
        surfacePanes(tab, found.kind).map((pane) => (pane.id === paneId ? { ...pane, activeFileId: fileId } : pane)),
      );
    }),
  );
  deps.setComposerFocused(false);
}
