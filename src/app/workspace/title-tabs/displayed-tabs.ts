import { startTransition } from "react";
import {
  type AppView,
  appViewForTab,
  appViewTabId,
  familiarForTab,
  familiarTabId,
  isViewTab,
  nextDisplayedTabAfterClose,
} from "@/features/workspace/model/app-view-tabs";
import { mergeOrderedSubset } from "@/shared/lib/reorder";
import type { DisplayedTabsDeps } from "./displayed-tabs-deps";

/** Title tab actions of the inset layout, where app views and Familiars are tabs too. */
export function createDisplayedTabs(deps: DisplayedTabsDeps) {
  const selectTitleTab = (id: string): void => {
    const familiarId = familiarForTab(id);
    if (familiarId) {
      void deps.openFamiliar(familiarId);
      return;
    }
    const view = appViewForTab(id);
    if (view) {
      deps.openAppView(view);
      return;
    }
    const state = deps.store.getState();
    state.setSearchViewOpen(false);
    state.setSettingsOpen(false);
    state.setInboxViewOpen(false);
    state.setNotesViewOpen(false);
    deps.setAutomationsViewOpen(false);
    deps.activateTab(id);
  };

  const closeAppView = (view: AppView, selectNeighbor = true): void => {
    const navigation = deps.navigation.current;
    const nextId = selectNeighbor
      ? nextDisplayedTabAfterClose(navigation.tabs, navigation.activeId, appViewTabId(view))
      : undefined;
    startTransition(() => {
      deps.setOpenAppViews((current) => current.filter((entry) => entry !== view));
      deps.setTitleTabOrder((current) => current.filter((id) => id !== appViewTabId(view)));
      const state = deps.store.getState();
      if (view === "search") state.setSearchViewOpen(false);
      if (view === "inbox") state.setInboxViewOpen(false);
      if (view === "notes") state.setNotesViewOpen(false);
      if (view === "automations") deps.setAutomationsViewOpen(false);
      if (nextId) navigation.select?.(nextId);
    });
  };

  /** Closing a Familiar's tab puts its view away when it is the one shown. */
  const closeFamiliarTab = (familiarId: string, selectNeighbor = true): void => {
    const navigation = deps.navigation.current;
    const id = familiarTabId(familiarId);
    const showing = navigation.activeId === id;
    const nextId =
      selectNeighbor && showing ? nextDisplayedTabAfterClose(navigation.tabs, navigation.activeId, id) : undefined;
    startTransition(() => {
      deps.setOpenFamiliarTabs((current) => current.filter((entry) => entry !== familiarId));
      deps.setTitleTabOrder((current) => current.filter((entry) => entry !== id));
      if (nextId) navigation.select?.(nextId);
      else if (showing) deps.closeFamiliarView();
    });
  };

  const closeViewTab = (id: string, selectNeighbor?: boolean): void => {
    const view = appViewForTab(id);
    if (view) closeAppView(view, selectNeighbor);
    const familiarId = familiarForTab(id);
    if (familiarId) closeFamiliarTab(familiarId, selectNeighbor);
  };

  const closeDisplayedTab = (id: string): void => {
    if (isViewTab(id)) closeViewTab(id);
    else deps.workspace.closeTitleTab(id);
  };

  /**
   * Kept from a view tab, the workspace beneath falls back to one of this
   * project's shown tabs that stays open; with none left, Close All keeps a
   * blank one rather than reaching into another project.
   */
  const workspaceFallback = (closing: Set<string>, fallbackId: string): string | undefined => {
    if (!isViewTab(fallbackId)) return fallbackId;
    const { tabs } = deps.navigation.current;
    return [deps.activeTabIdRef.current, ...tabs.map((tab) => tab.id)].find(
      (id) => !closing.has(id) && !isViewTab(id) && tabs.some((tab) => tab.id === id),
    );
  };

  const closeDisplayedTabs = (ids: string[], fallbackId: string): void => {
    const navigation = deps.navigation.current;
    const closing = new Set(ids);
    const workspaceIds = ids.filter((id) => !isViewTab(id));
    startTransition(() => {
      for (const id of ids) {
        if (isViewTab(id)) closeViewTab(id, false);
      }
      if (workspaceIds.length > 0) {
        const fallback = workspaceFallback(closing, fallbackId);
        if (fallback) deps.workspace.closeTabs(workspaceIds, fallback);
        else deps.workspace.closeEveryTab(workspaceIds);
      }
      if (closing.has(navigation.activeId)) navigation.select?.(fallbackId);
    });
  };

  const closeAllDisplayedTabs = (ids: readonly string[]): void => {
    startTransition(() => {
      for (const id of ids) {
        if (isViewTab(id)) closeViewTab(id, false);
      }
      deps.workspace.closeEveryTab(ids.filter((id) => !isViewTab(id)));
    });
  };

  const reorderDisplayedTabs = (ids: string[], movedId?: string): void => {
    deps.setTitleTabOrder((current) =>
      mergeOrderedSubset(
        current.map((id) => ({ id })),
        ids.map((id) => ({ id })),
      ).map((tab) => tab.id),
    );
    deps.workspace.reorderTabs(
      ids.filter((id) => !isViewTab(id)),
      isViewTab(movedId ?? "") ? undefined : movedId,
    );
  };

  return {
    selectTitleTab,
    closeAppView,
    closeFamiliarTab,
    closeViewTab,
    closeDisplayedTab,
    closeDisplayedTabs,
    closeAllDisplayedTabs,
    reorderDisplayedTabs,
  };
}

export type DisplayedTabs = ReturnType<typeof createDisplayedTabs>;
