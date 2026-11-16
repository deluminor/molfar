import {
  closeSurfacePanes,
  resetTabToSession,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import type { TabCloseDeps } from "./tab-close-deps";
import { closeTab, closeTabs } from "./tab-close";
import { clearTabSession } from "./tab-clear";
import {
  closePlan,
  confirmClosing,
  forgetDirty,
  seedSession,
  tabFiles,
  tabSessionIds,
  unsavedFiles,
} from "./tab-close-steps";

/**
 * The workspace always keeps one tab, so close every other tab and reset the
 * active one to a blank session. `scope` limits this to those tabs, such as
 * the ones the title bar shows. Every confirmation runs before any tab
 * changes, so a cancelled prompt leaves all tabs.
 */
export function closeEveryTab(deps: TabCloseDeps, scope?: readonly string[]): void {
  const inScope = scope ? new Set(scope) : null;
  const tab = deps.tabs().find((entry) => entry.id === deps.activeTabId());
  if (!tab || (inScope && !inScope.has(tab.id))) return;

  const others = deps
    .tabs()
    .filter((entry) => entry.id !== tab.id && (!inScope || inScope.has(entry.id)));
  const keptFiles = tabFiles(tab);
  const files = [...others.flatMap(tabFiles), ...keptFiles];

  void (async () => {
    const unsaved = unsavedFiles(deps, files);
    const terminals = files.filter((file) => file.terminal);
    if (!(await confirmClosing(deps, unsaved, terminals, "Close all tabs with unsaved files?")))
      return;

    if (others.length > 0) {
      closeTabs(
        deps,
        others.map((entry) => entry.id),
        tab.id,
        { confirmed: true },
      );
    }
    if (tabSessionIds(deps, tab).length > 0) {
      clearTabSession(deps, tab.id, { confirmed: true });
      return;
    }

    // The tab held no session: seed one so the workspace stays usable.
    const session = seedSession(deps, keptFiles[0]?.cwd || deps.projectCwd());
    deps.setSessions((previous) => [...previous, session]);
    forgetDirty(
      deps,
      keptFiles.map((file) => file.id),
    );
    replaceTab(deps, tab.id, resetTabToSession(tab, session.id));
    deps.setComposerFocused(true);
  })();
}

/**
 * Closes the active tab's open files first; only when none are open does it
 * close every workspace tab.
 */
export function closeAllTabs(deps: TabCloseDeps): void {
  deps.closeFamiliarView();
  const tab = deps.tabs().find((entry) => entry.id === deps.activeTabId());
  if (!tab) return;

  const editorFiles = tab.editorPanes.flatMap((pane) => pane.files);
  if (editorFiles.length === 0) {
    closeEveryTab(deps);
    return;
  }

  const remaining = closeSurfacePanes(tab, "editor");
  if (!remaining && closePlan(deps, tab.id).action === "close") {
    closeTab(deps, tab.id);
    return;
  }

  const finish = () => {
    let next = remaining;
    let focusesSession = deps.sessions().some((session) => session.id === remaining?.focusedId);
    if (!next) {
      // The tab held only editor panes and must stay: seed a session.
      const session = seedSession(deps, editorFiles[0].cwd || deps.projectCwd());
      deps.setSessions((previous) => [...previous, session]);
      next = resetTabToSession(tab, session.id);
      focusesSession = true;
    }
    replaceTab(deps, tab.id, next);
    forgetDirty(
      deps,
      editorFiles.map((file) => file.id),
    );
    deps.setComposerFocused(focusesSession);
  };

  void (async () => {
    const unsaved = unsavedFiles(deps, editorFiles);
    if (await confirmClosing(deps, unsaved, [], "Close all open files with unsaved changes?"))
      finish();
  })();
}

function replaceTab(deps: TabCloseDeps, tabId: string, next: WorkspaceTab): void {
  deps.store
    .getState()
    .setTabs((previous) => previous.map((entry) => (entry.id === tabId ? next : entry)));
}
