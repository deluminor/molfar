import { startTransition } from "react";
import {
  appViewForTab,
  familiarForTab,
  isViewTab,
  nextDisplayedTabAfterClose,
} from "@/features/workspace/model/app-view-tabs";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { TabCloseDeps } from "./tab-close-deps";
import {
  closePlan,
  confirmClosing,
  forgetDirty,
  retireSession,
  tabFiles,
  tabSessionIds,
  unsavedFiles,
} from "./tab-close-steps";

/**
 * Closes a workspace tab after confirming unsaved files and running terminals
 * (`confirmedTerminalIds` were confirmed by the caller). The project's last
 * tab stays.
 */
export function closeTab(
  deps: TabCloseDeps,
  tabId: string,
  options?: { confirmedTerminalIds?: string[] },
): void {
  const current = deps.tabs();
  const closing = current.find((tab) => tab.id === tabId);
  if (!closing) return;
  const plan = closePlan(deps, tabId);
  if (plan.action === "keep") return;

  const files = tabFiles(closing);
  const confirmed = new Set(options?.confirmedTerminalIds ?? []);
  const terminals = files.filter((file) => file.terminal && !confirmed.has(file.id));

  void (async () => {
    const unsaved = unsavedFiles(deps, files);
    if (!(await confirmClosing(deps, unsaved, terminals, "Close this tab with unsaved files?")))
      return;

    for (const sessionId of tabSessionIds(deps, closing)) retireSession(deps, sessionId);
    forgetDirty(
      deps,
      files.map((file) => file.id),
    );
    finishTabClose(
      deps,
      current.filter((tab) => tab.id !== tabId),
      tabId,
      plan.nextActiveTabId,
    );
  })();
}

/** Moves on from the closed tab to the one the title bar shows next. */
function finishTabClose(
  deps: TabCloseDeps,
  next: WorkspaceTab[],
  tabId: string,
  nextActiveTabId: string | undefined,
): void {
  const { setTabs, setActiveTabId } = deps.store.getState();
  if (tabId !== deps.activeTabId()) {
    setTabs(next);
    deps.refreshHistory();
    return;
  }

  const navigation = deps.navigation();
  // A view shown over this tab stays up; only the workspace beneath it moves on.
  if (deps.insetLayout() && navigation.activeId !== tabId && isViewTab(navigation.activeId)) {
    setTabs(next);
    if (nextActiveTabId) setActiveTabId(nextActiveTabId);
    deps.refreshHistory();
    return;
  }

  const nextId = nextDisplayedTabAfterClose(navigation.tabs, navigation.activeId, tabId);
  const close = () => {
    setTabs(next);
    // View tabs still need a valid workspace to return to underneath; a
    // Familiar's opens over it, so it moves there without revealing it.
    if (nextActiveTabId) {
      if (nextId && familiarForTab(nextId)) setActiveTabId(nextActiveTabId);
      else if (!nextId || appViewForTab(nextId)) deps.activateTab(nextActiveTabId);
    }
    if (nextId) navigation.select?.(nextId);
  };
  // A view tab opens in a transition; closing alongside it keeps the
  // workspace beneath from painting between the two.
  if (nextId && isViewTab(nextId)) startTransition(close);
  else close();
  deps.refreshHistory();
}

/** Closes `tabIds` and activates `fallbackId` if the active tab was among them. */
export function closeTabs(
  deps: TabCloseDeps,
  tabIds: string[],
  fallbackId: string,
  options?: { confirmed?: boolean },
): void {
  const closingIds = new Set(tabIds);
  const closing = deps.tabs().filter((tab) => closingIds.has(tab.id));
  const fallback = deps
    .tabs()
    .find((tab) => tab.id === fallbackId && !closingIds.has(tab.id));
  if (!fallback || closing.length === 0) return;

  const files = closing.flatMap(tabFiles);
  const finish = () => {
    const sessionIds = new Set(closing.flatMap((tab) => tabSessionIds(deps, tab)));
    for (const sessionId of sessionIds) retireSession(deps, sessionId);
    forgetDirty(
      deps,
      files.map((file) => file.id),
    );
    deps.store
      .getState()
      .setTabs((previous) => previous.filter((tab) => !closingIds.has(tab.id)));
    if (closingIds.has(deps.activeTabId())) deps.activateTab(fallback.id);
    deps.refreshHistory();
  };

  // The caller already confirmed unsaved files and terminals.
  if (options?.confirmed) {
    finish();
    return;
  }

  void (async () => {
    const unsaved = unsavedFiles(deps, files);
    const terminals = files.filter((file) => file.terminal);
    if (await confirmClosing(deps, unsaved, terminals, "Close these tabs with unsaved files?"))
      finish();
  })();
}

export function closeOtherTabs(deps: TabCloseDeps): void {
  const activeId = deps.activeTabId();
  const tabs = deps.tabs();
  if (!tabs.some((tab) => tab.id === activeId)) return;

  closeTabs(
    deps,
    tabs.filter((tab) => tab.id !== activeId).map((tab) => tab.id),
    activeId,
  );
}
