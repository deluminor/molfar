import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";

export type ForegroundView = {
  /** The window is hidden or minimised. */
  hidden: boolean;
  /** No surface (search, inbox, notes, …) covers the workspace. */
  workspaceVisible: boolean;
  /** Standalone conversation (Inbox ask, a Familiar) shown outside the tab tree. */
  standaloneSessionId?: string;
  /** A session shown beside the Familiar's chat. */
  sideSessionId?: string;
  activeTab: WorkspaceTab | undefined;
};

/** Whether a session's output is on screen now, so it streams every frame. */
export function isForegroundSession(
  sessionId: string,
  view: ForegroundView,
): boolean {
  if (view.hidden) return false;
  if (
    view.standaloneSessionId === sessionId ||
    view.sideSessionId === sessionId
  )
    return true;

  const tab = view.activeTab;
  if (!view.workspaceVisible || !tab) return false;

  return (
    leafIds(tab.layout).includes(sessionId) ||
    tab.editorPanes.some((pane) =>
      pane.files.some(
        (file) =>
          file.id === pane.activeFileId && file.agent?.sessionId === sessionId,
      ),
    )
  );
}
