import { appViewTabId } from "@/features/workspace/model/app-view-tabs";
import type { DisplayedTabs } from "./displayed-tabs";
import type { DisplayedTabsDeps } from "./displayed-tabs-deps";

/**
 * Tab shortcuts (close, cycle, activate by position, close others/all). The
 * inset layout runs them over every kind of title tab, like its tab menu; the
 * classic layout over workspace tabs.
 */
export function createVisibleTabShortcuts(deps: DisplayedTabsDeps, displayed: DisplayedTabs) {
  const shownId = (): string => {
    const { familiarTabId, activeAppView, activeTabId } = deps.visible();
    if (familiarTabId) return familiarTabId;
    return activeAppView ? appViewTabId(activeAppView) : activeTabId;
  };

  const closeVisibleTab = (): void => {
    const { insetLayout, familiarTabId, activeAppView } = deps.visible();
    if (insetLayout && familiarTabId) displayed.closeViewTab(familiarTabId);
    else if (insetLayout && activeAppView) displayed.closeAppView(activeAppView);
    else deps.workspace.closeFocused();
  };

  const cycleVisibleTab = (delta: number): void => {
    const { insetLayout, titleTabs } = deps.visible();
    if (!insetLayout) {
      if (delta > 0) deps.workspace.next();
      else deps.workspace.prev();
      return;
    }
    const index = titleTabs.findIndex((tab) => tab.id === shownId());
    const next = titleTabs[(index + delta + titleTabs.length) % titleTabs.length];
    if (next) displayed.selectTitleTab(next.id);
  };

  const activateVisibleTab = (slot: number): void => {
    const { insetLayout, titleTabs } = deps.visible();
    if (!insetLayout) {
      deps.workspace.activate(slot);
      return;
    }
    const tab = slot < 0 ? titleTabs[titleTabs.length - 1] : titleTabs[slot];
    if (tab) displayed.selectTitleTab(tab.id);
  };

  const closeOtherVisibleTabs = (): void => {
    if (!deps.visible().insetLayout) {
      deps.workspace.closeOtherTabs();
      return;
    }
    const { tabs: shown, activeId } = deps.navigation.current;
    if (!shown.some((tab) => tab.id === activeId)) return;
    displayed.closeDisplayedTabs(
      shown.filter((tab) => tab.id !== activeId).map((tab) => tab.id),
      activeId,
    );
  };

  const closeAllVisibleTabs = (): void => {
    if (!deps.visible().insetLayout) {
      deps.workspace.closeAllTabs();
      return;
    }
    displayed.closeAllDisplayedTabs(deps.navigation.current.tabs.map((tab) => tab.id));
  };

  return { closeVisibleTab, cycleVisibleTab, activateVisibleTab, closeOtherVisibleTabs, closeAllVisibleTabs };
}
