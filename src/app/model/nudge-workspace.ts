import { invalidateProjectFiles } from "@/features/files/model/file-index";
import { notifyDirsChanged } from "@/features/files/model/file-tree";

/** Tells file surfaces under `cwd` that a turn may have changed the tree. */
export function nudgeWorkspace(cwd?: string): void {
  invalidateProjectFiles(cwd);
  notifyDirsChanged();
}
