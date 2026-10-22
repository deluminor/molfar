import type { GitFileDiffKind } from "@/domain/git/working-tree";
import {
  focusedFileTab,
  isCommitTab,
  isFilesystemTab,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import { displayPath } from "@/shared/lib/paths";

/** The reviewed file focused in the tab, as the Changes list shows its path. */
export function selectedChangePath(
  tab: WorkspaceTab,
  gitCwd?: string,
): string | undefined {
  const file = focusedFileTab(tab);
  if (!file || !isFilesystemTab(file) || !file.review) return undefined;
  return displayPath(file.path, gitCwd || file.cwd);
}

export function selectedChangeKind(tab: WorkspaceTab): GitFileDiffKind | undefined {
  const file = focusedFileTab(tab);
  return file?.review ? file.changeKind : undefined;
}

/** The commit focused in the tab, or shown in one of its editor panes. */
export function selectedCommitSha(tab: WorkspaceTab): string | undefined {
  const focused = focusedFileTab(tab);
  if (focused && isCommitTab(focused)) return focused.commit.sha;
  for (const pane of tab.editorPanes) {
    const file = pane.files.find((entry) => entry.id === pane.activeFileId);
    if (file && isCommitTab(file)) return file.commit.sha;
  }
}
