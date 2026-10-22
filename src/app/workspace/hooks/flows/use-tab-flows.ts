import { confirmCloseTerminal, confirmCloseTerminals } from "@/features/terminal/model/terminal-close";
import { forgetHarnessSession } from "@/integrations/harness";
import { confirmDiscardUnsaved } from "../../../model/confirm-discard-unsaved";
import { createTabCloseActions } from "../../flows/tabs/close/tab-close-actions";
import { createNewSessionActions } from "../../flows/tabs/new-session/new-session-actions";
import type { TabFocusDeps } from "../../flows/tabs/tab-focus";
import type { TabLayoutDeps } from "../../flows/tabs/tab-layout";
import { createTabLayoutActions } from "../../flows/tabs/tab-layout-actions";
import { createTerminalActions } from "../../flows/terminals/terminal-actions";
import type { DisplayedTabNavigation } from "../../title-tabs/displayed-tabs-deps";
import { useStableFlow } from "../use-stable-flow";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

export type TabFlowsInput = {
  /** Where a new terminal starts, as last rendered. */
  terminalCwdRef: { readonly current: string };
  displayedTabNavigation: { readonly current: DisplayedTabNavigation };
};

export function createTabFlows(core: WorkspaceFlowCore, input: TabFlowsInput) {
  const { store, tabsRef, sessionsRef, activeTabIdRef, projectCwdRef, sidebarCwdRef } = core;

  const focus: TabFocusDeps = {
    store,
    tabs: () => tabsRef.current,
    sessions: () => sessionsRef.current,
    activeTabId: () => activeTabIdRef.current,
    projectCwd: () => projectCwdRef.current,
    selectTab: (tabId, reason) => {
      if (reason === "workspace") core.setActiveTabId(tabId);
      else core.selectTab(tabId);
    },
    setComposerFocused: (focused) => core.setComposerFocused(focused),
    cache: core.loadedSessionCache.current,
    persistence: core.persistence,
    forgetHarness: (session) => void forgetHarnessSession(session.harness, session.id),
    leaveCoveringViews: () => core.familiarView.close(),
  };
  const layout: TabLayoutDeps = {
    store,
    activeTabId: () => activeTabIdRef.current,
    projectOfTab: core.projectOfTab,
  };
  const tabLayout = createTabLayoutActions({ focus, layout });

  const terminals = createTerminalActions({
    store,
    projectCwd: () => projectCwdRef.current,
    sidebarCwd: () => sidebarCwdRef.current,
    terminalCwd: () => input.terminalCwdRef.current,
    docks: () => store.getState().projectTerminals,
    lastDockSide: () => store.getState().lastDockSide,
    tabs: () => tabsRef.current,
    sessions: () => sessionsRef.current,
    activeTabId: () => activeTabIdRef.current,
    setComposerFocused: (focused) => core.setComposerFocused(focused),
    selectTab: (tabId) => core.selectTab(tabId),
    appendTab: (tab, cwd) => tabLayout.append(tab, cwd),
    leaveCoveringFamiliar: () => core.leaveCoveringFamiliar(),
    dropBlankSession: (session) => {
      core.persistence.forgetSaved(session.id);
      void forgetHarnessSession(session.harness, session.id);
      core.setSessions((prev) => prev.filter((entry) => entry.id !== session.id));
    },
    confirmCloseTerminal,
    confirmCloseTerminals,
  });

  const tabClose = createTabCloseActions({
    store,
    tabs: () => tabsRef.current,
    sessions: () => sessionsRef.current,
    activeTabId: () => activeTabIdRef.current,
    projectCwd: () => projectCwdRef.current,
    dirtyFiles: () => store.getState().dirtyFiles,
    setSessions: (update) => core.setSessions(update),
    setComposerFocused: (focused) => core.setComposerFocused(focused),
    insetLayout: () => core.insetLayoutRef.current,
    navigation: () => input.displayedTabNavigation.current,
    tabWorkspace: (tab, list) => core.tabWorkspace(tab, list),
    activateTab: (tabId) => tabLayout.activate(tabId),
    persist: (session) => core.persistence.persist(session),
    refreshHistory: () => void core.refreshHistory(sidebarCwdRef.current),
    closeFamiliarView: () => core.familiarView.close(),
    confirmDiscardUnsaved,
    confirmCloseTerminal,
    confirmCloseTerminals,
  });

  const newSessions = createNewSessionActions({
    store,
    tabsRef,
    sessionsRef,
    defaults: () => core.sessionDefaultsRef.current,
    activeTab: () => core.activeTabRef.current,
    sidebarCwd: () => sidebarCwdRef.current,
    projectCwd: () => projectCwdRef.current,
    setAutomationsViewOpen: (open) => core.setAutomationsViewOpen(open),
    openSessionTab: (session, cwd) => tabLayout.openSessionTab(session, cwd),
    activateTab: (tabId, paneId) => tabLayout.activate(tabId, paneId),
    selectTab: (tabId) => core.selectTab(tabId),
    setComposerFocused: (focused) => core.setComposerFocused(focused),
    closeFamiliarView: () => core.familiarView.close(),
    terminals,
    closePane: () => tabClose.closePane(),
  });

  return { focus, layout, tabLayout, terminals, tabClose, newSessions };
}

export type TabFlows = ReturnType<typeof createTabFlows>;

/** Tab layout, terminals, tab closing and new sessions, created once. */
export function useTabFlows(core: WorkspaceFlowCore, input: TabFlowsInput): TabFlows {
  return useStableFlow(() => createTabFlows(core, input));
}
