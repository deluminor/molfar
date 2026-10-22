import type { GitFileDiffKind } from "@/domain/git/working-tree";
import { rememberOpenedFile, resolveOpenablePath } from "@/features/files/model/file-index";
import type { SidebarTabId } from "@/features/settings/model/appearance";
import { loadDiffViewer } from "@/features/settings/model/settings";
import {
  newFileTab,
  openChangesTab,
  openEditorTab,
  openSessionChangesTab,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import type { FileDeps } from "./file-deps";

export type OpenDiffDeps = Pick<FileDeps, "store" | "sessionsRef" | "activeTabIdRef" | "gitCwd" | "sidebarCwd" | "setComposerFocused"> & {
  setSidebarTab(tab: SidebarTabId, project?: string): void;
};

export type OpenDiffOptions = {
  session?: { sessionId: string; cwd: string };
  changeKind?: GitFileDiffKind;
  pin?: boolean;
  /** The path is already resolved; skip looking for a nearby openable file. */
  exact?: boolean;
};

type DiffTarget = { cwd: string; projectCwd: string | undefined; path: string | undefined };

function openInTab(tab: WorkspaceTab, target: DiffTarget, options: OpenDiffOptions): WorkspaceTab {
  const { cwd, projectCwd, path } = target;
  if (options.session)
    return openSessionChangesTab(tab, options.session.cwd, options.session.sessionId, path, projectCwd, options.pin);
  if (loadDiffViewer() === "unified") return openChangesTab(tab, cwd, path, options.changeKind, projectCwd);
  if (!path) return tab;
  return openEditorTab(tab, newFileTab(path, cwd, true, options.changeKind, projectCwd), { pin: options.pin });
}

/** Shows a file's diff, or a session's changes, in the active tab and focuses the Changes panel. */
export async function openDiff(deps: OpenDiffDeps, path: string | undefined, options: OpenDiffOptions = {}): Promise<void> {
  const { session } = options;
  const activeTabId = deps.activeTabIdRef.current;
  const cwd = session?.cwd ?? deps.gitCwd();
  const projectCwd = session
    ? deps.sessionsRef.current.find((entry) => entry.id === session.sessionId)?.cwd
    : deps.sidebarCwd();
  const resolved = path ? (options.exact ? path : ((await resolveOpenablePath(cwd, path)) ?? path)) : undefined;

  if (resolved) rememberOpenedFile(cwd, resolved);
  const target = { cwd, projectCwd, path: resolved };
  deps.store.getState().setTabs((tabs) => tabs.map((tab) => (tab.id === activeTabId ? openInTab(tab, target, options) : tab)));
  deps.setSidebarTab("changes", projectCwd);
  deps.setComposerFocused(false);
}
