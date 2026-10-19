import type { Session } from "@/domain/session/session";
import {
  rememberRemotePendingWorktree,
  rememberRemoteSession,
} from "@/features/connections/model/connections";
import { newSession } from "@/features/sessions/model/session";
import {
  type FilePaneTab,
  isFilesystemTab,
  leafIds,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import {
  planWorkspaceTabClose,
  type WorkspaceTabClosePlan,
} from "@/features/workspace/model/workspace-tab-groups";
import type { TabCloseDeps } from "./tab-close-deps";

/** Every file and terminal open in the tab's panes. */
export function tabFiles(tab: WorkspaceTab): FilePaneTab[] {
  return [
    ...tab.editorPanes.flatMap((pane) => pane.files),
    ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
  ];
}

export function unsavedFiles(deps: TabCloseDeps, files: FilePaneTab[]): FilePaneTab[] {
  const dirty = deps.dirtyFiles();
  return files.filter((file) => isFilesystemTab(file) && dirty.has(file.id));
}

/** Asks about unsaved files, then running terminals; false once either is declined. */
export async function confirmClosing(
  deps: TabCloseDeps,
  unsaved: FilePaneTab[],
  terminals: FilePaneTab[],
  unsavedMessage: string,
): Promise<boolean> {
  if (unsaved.length > 0 && !(await deps.confirmDiscardUnsaved(unsavedMessage))) return false;
  if (terminals.length > 0 && !(await deps.confirmCloseTerminals(terminals))) return false;
  return true;
}

/** Whether closing the tab removes it, or keeps it as the project's last one. */
export function closePlan(deps: TabCloseDeps, tabId: string): WorkspaceTabClosePlan {
  return planWorkspaceTabClose({
    tabs: deps.tabs(),
    sessions: deps.sessions(),
    closingTabId: tabId,
    scope: "project",
    worktreeOf: (tab) => deps.tabWorkspace(tab, deps.sessions()),
  });
}

export function forgetDirty(deps: TabCloseDeps, fileIds: Iterable<string>): void {
  deps.store.getState().setDirtyFiles((previous) => {
    const next = new Set(previous);
    for (const id of fileIds) next.delete(id);
    return next;
  });
}

/** Session panes of the tab that are still open. */
export function tabSessionIds(deps: TabCloseDeps, tab: WorkspaceTab): string[] {
  const sessions = deps.sessions();
  return leafIds(tab.layout).filter((paneId) =>
    sessions.some((session) => session.id === paneId),
  );
}

/** Saves a closing pane's session and remembers its remote binding for reopening. */
export function retireSession(deps: TabCloseDeps, sessionId: string): void {
  deps.persist(deps.sessions().find((session) => session.id === sessionId));
  forgetRemoteShell(sessionId);
}

export function forgetRemoteShell(shellId: string): void {
  rememberRemoteSession(shellId);
  rememberRemotePendingWorktree(shellId);
}

/** A blank session in `cwd` with the first open session's harness and model. */
export function seedSession(deps: TabCloseDeps, cwd: string): Session {
  const seed = deps.sessions()[0];
  return newSession(
    seed?.harness ?? "claude",
    cwd,
    seed?.model,
    seed?.runtimeMode,
    seed?.modelSettings,
  );
}
