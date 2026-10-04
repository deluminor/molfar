import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";

export type ForegroundView = {
  /** The window is hidden or minimised. */
  hidden: boolean;
  /** No surface (search, inbox, notes, …) covers the workspace. */
  workspaceVisible: boolean;
  /** Session shown in the Inbox, which owns it outside the tab tree. */
  inboxSessionId?: string;
  activeTab: WorkspaceTab | undefined;
};

/** Whether a session's output is on screen now, so it streams every frame. */
export function isForegroundSession(
  sessionId: string,
  view: ForegroundView,
): boolean {
  if (view.hidden) return false;
  if (view.inboxSessionId === sessionId) return true;

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
