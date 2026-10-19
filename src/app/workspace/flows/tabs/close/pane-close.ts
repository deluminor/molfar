import { closeLeaf, findSurfacePane } from "@/features/workspace/model/layout";
import { activeWorkspaceTab } from "../../../../model/active-workspace-tab";
import { closeFile } from "./file-close";
import type { TabCloseDeps } from "./tab-close-deps";
import { closeTab } from "./tab-close";
import { clearTabSession } from "./tab-clear";
import { closePlan, tabSessionIds } from "./tab-close-steps";

/**
 * Closes a conversation pane of the active tab, the focused one by default; a
 * focused file pane closes its file instead. The tab's last pane closes the
 * tab, or clears it when the project keeps it. A Familiar in view closes first.
 */
export function closePane(deps: TabCloseDeps, sessionId?: string): void {
  if (deps.store.getState().familiarViewId) {
    deps.closeFamiliarView();
    deps.setComposerFocused(true);
    return;
  }
  // The project terminal is shared by every workspace tab in the project, so
  // pane and title-bar close buttons stay scoped to workspace tabs and panes.
  const tab = activeWorkspaceTab(deps.tabs(), deps.activeTabId(), deps.sessions(), deps.projectCwd());
  if (!tab) return;
  const focusedSurface = findSurfacePane(tab, tab.focusedId);
  if (sessionId === undefined && focusedSurface) {
    closeFile(deps, focusedSurface.pane.id, focusedSurface.pane.activeFileId);
    return;
  }

  const closingId = sessionId ?? tab.focusedId;
  if (!tabSessionIds(deps, tab).includes(closingId)) return;
  const next = closeLeaf(tab, closingId);
  if (!next) {
    if (closePlan(deps, tab.id).action === "keep") {
      clearTabSession(deps, tab.id, { selectNeighbor: true });
    } else {
      closeTab(deps, tab.id);
    }
    return;
  }

  deps.persist(deps.sessions().find((session) => session.id === closingId));
  deps.store
    .getState()
    .setTabs((previous) =>
      previous.map((entry) =>
        entry.id === tab.id ? { ...entry, layout: next.layout, focusedId: next.focusedId } : entry,
      ),
    );
  if (closingId === tab.focusedId) {
    deps.setComposerFocused(deps.sessions().some((session) => session.id === next.focusedId));
  }
  deps.refreshHistory();
}

/** A title tab's close button: the active tab the project keeps closes its pane instead. */
export function closeTitleTab(deps: TabCloseDeps, tabId: string): void {
  // The inset layout shows a Familiar as its own tab, which closing another
  // tab leaves alone.
  if (!deps.insetLayout()) deps.closeFamiliarView();
  if (closePlan(deps, tabId).action === "keep" && tabId === deps.activeTabId()) {
    closePane(deps);
    return;
  }

  closeTab(deps, tabId);
}
