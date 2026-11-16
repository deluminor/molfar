import { applyDetachPaneToTab } from "@/features/workspace/model/workspace-tab-groups";
import { leafIds } from "@/features/workspace/model/layout";
import { shownFamiliarSession } from "../../store/familiars-slice";
import type { PaneDeps } from "./pane-deps";

/** Focuses a pane: a Familiar's chat or launched session, or a pane of the active tab. */
export function focusPane(deps: PaneDeps, paneId: string): void {
  const state = deps.store.getState();
  if (paneId === state.familiarViewId || paneId === shownFamiliarSession(state)) {
    state.setFamiliarShownSessionFocused(paneId !== state.familiarViewId);
    state.setProjectTerminalFocused(false);
    deps.setComposerFocused(true);
    return;
  }
  // Over the Familiar, only its sidebar holds panes outside the workspace: a
  // launched session sliding away as another opens. Its late focus must
  // not close the Familiar and send that session to its project.
  if (state.familiarViewId && !deps.tabsRef.current.some((tab) => leafIds(tab.layout).includes(paneId))) return;

  deps.closeFamiliarView();
  const activeTab = deps.tabsRef.current.find((tab) => tab.id === deps.activeTabIdRef.current);
  if (activeTab?.focusedId !== paneId) deps.cancelNavigation();
  state.setProjectTerminalFocused(false);
  if (state.inboxAskPortal?.sessionId === paneId) {
    deps.setComposerFocused(true);
    return;
  }

  state.setTabs((prev) => {
    const selectedId = deps.activeTabIdRef.current;
    const selected = prev.find((tab) => tab.id === selectedId);
    if (!selected || (selected.focusedId === paneId && !selected.diffFocused)) return prev;
    return prev.map((tab) => (tab.id === selectedId ? { ...tab, focusedId: paneId, diffFocused: false } : tab));
  });
  deps.setComposerFocused(deps.sessionsRef.current.some((session) => session.id === paneId));
}

/** Moves a pane out of its tab into a tab of its own beside `targetTabId`. */
export function detachPane(
  deps: PaneDeps,
  paneId: string,
  targetTabId: string,
  position: "before" | "after",
): void {
  const result = applyDetachPaneToTab({ tabs: deps.tabsRef.current, paneId, targetTabId, position });
  if (!result) return;

  deps.tabsRef.current = result.tabs;
  const state = deps.store.getState();
  state.setTabs(result.tabs);
  state.setProjectTerminalFocused(false);
  deps.activateTab(result.activeTabId, result.focusedId);
}
