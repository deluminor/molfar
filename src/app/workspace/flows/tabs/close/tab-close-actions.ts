import { closeFile, closeOtherFiles } from "./file-close";
import { closePane, closeTitleTab } from "./pane-close";
import { closeDeletedRemoteSession } from "./tab-clear";
import { closeTab, closeTabs, closeOtherTabs } from "./tab-close";
import { closeAllTabs, closeEveryTab } from "./tab-close-all";
import type { TabCloseDeps } from "./tab-close-deps";

/** The tab, pane and file close flows bound to `deps`, created once for the workspace. */
export function createTabCloseActions(deps: TabCloseDeps) {
  return {
    closeTab: (tabId: string, options?: { confirmedTerminalIds?: string[] }) =>
      closeTab(deps, tabId, options),
    closeTabs: (tabIds: string[], fallbackId: string, options?: { confirmed?: boolean }) =>
      closeTabs(deps, tabIds, fallbackId, options),
    closeOtherTabs: () => closeOtherTabs(deps),
    closeEveryTab: (scope?: readonly string[]) => closeEveryTab(deps, scope),
    closeAllTabs: () => closeAllTabs(deps),
    closeTitleTab: (tabId: string) => closeTitleTab(deps, tabId),
    closePane: (sessionId?: string) => closePane(deps, sessionId),
    closeFile: (paneId: string, fileId: string) => closeFile(deps, paneId, fileId),
    closeOtherFiles: (paneId: string, fileId: string) => closeOtherFiles(deps, paneId, fileId),
    closeDeletedRemoteSession: (remoteSessionId: string) =>
      closeDeletedRemoteSession(deps, remoteSessionId),
  };
}

export type TabCloseActions = ReturnType<typeof createTabCloseActions>;
