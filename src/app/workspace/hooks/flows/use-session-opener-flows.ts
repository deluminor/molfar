import { sessionWorkCwd } from "@/domain/session/session-state";
import { repairSession } from "@/features/sessions/data/session-store";
import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { bindHarnessSession, isLiveHarness } from "@/integrations/harness";
import { updateSessionState } from "../../../model/session-state";
import type { OpenDiffDeps } from "../../flows/files/open-diff";
import type { createLinkedUpdateCards } from "../../flows/linked-work-items/linked-update-card";
import type { OpenSavedSessionDeps } from "../../flows/session-history/open-saved-session";
import type { PaneDeps } from "../../flows/tabs/pane-deps";
import type { PlaceSessionDeps } from "../../flows/tabs/place-session";
import type { SessionListDeps } from "../../flows/tabs/session-list-navigation";
import { createSessionOpenerActions } from "../../flows/tabs/session-opener-actions";
import { createTabActions } from "../../flows/tabs/tab-actions";
import type { TabVisits } from "../../flows/tabs/tab-visits";
import { useStableFlow } from "../use-stable-flow";
import type { TabFlows } from "./use-tab-flows";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

export type SessionOpenerFlowsInput = {
  tabFlows: TabFlows;
  visits: TabVisits;
  linkedUpdateCards: Pick<ReturnType<typeof createLinkedUpdateCards>, "reveal">;
  linkedUpdatesRef: { readonly current: ReadonlyMap<string, LinkedSessionUpdate> };
  /** The sidebar's session ids, in the order the user sees them. */
  navigationIdsRef: { readonly current: readonly string[] };
  /** The tabs the deck shows for the current project, as last rendered. */
  deckTabsRef: { readonly current: readonly WorkspaceTab[] };
};

export function createSessionOpenerFlows(core: WorkspaceFlowCore, input: SessionOpenerFlowsInput) {
  const { store, tabsRef, sessionsRef, activeTabIdRef, sidebarCwdRef, setSessions } = core;
  const { tabLayout, newSessions } = input.tabFlows;

  const pane: PaneDeps = {
    store,
    tabsRef,
    activeTabIdRef,
    sessionsRef,
    setComposerFocused: (focused) => core.setComposerFocused(focused),
    closeFamiliarView: () => core.familiarView.close(),
    closeAutomations: () => core.setAutomationsViewOpen(false),
    cancelNavigation: () => core.navigation.cancel(),
    activateTab: (tabId, paneId) => tabLayout.activate(tabId, paneId),
    selectTab: (tabId) => core.selectTab(tabId),
    appendTab: (tab, cwd) => tabLayout.append(tab, cwd),
    ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
    openFamiliar: (familiarId) => core.familiarView.open(familiarId),
    focusOpenSession: (sessionId) => sessionOpeners.focusOpen(sessionId),
    replaceBlankPane: (session) => sessionOpeners.replaceBlankPane(session),
    linkedUpdates: () => input.linkedUpdatesRef.current,
    revealLinkedUpdate: (sessionId, update) => input.linkedUpdateCards.reveal(sessionId, update),
  };
  const sessionList: SessionListDeps = {
    ...pane,
    navigationIds: input.navigationIdsRef,
    selectHistorySession: (sessionId) => sessionOpeners.selectHistory(sessionId),
    selectRemoteSession: newSessions.selectRemoteSession,
    prefetch: (sessionId) => core.loader.prefetch(sessionId),
  };
  const diff: OpenDiffDeps = {
    store,
    sessionsRef,
    activeTabIdRef,
    gitCwd: () => core.gitCwdRef.current,
    sidebarCwd: () => sidebarCwdRef.current,
    setComposerFocused: (focused) => core.setComposerFocused(focused),
    setSidebarTab: (tab, project) => core.setSidebarTab(tab, project),
  };
  const place: PlaceSessionDeps = {
    store,
    sessionsRef,
    tabsRef,
    persistence: core.persistence,
    scope: "project",
    projectCwd: () => core.projectCwdRef.current,
    ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
    setSessions: (next) => setSessions(next),
    selectTab: (tabId) => core.selectTab(tabId),
    setComposerFocused: (focused) => core.setComposerFocused(focused),
  };
  const tabActions = createTabActions({
    pane,
    diff,
    layout: input.tabFlows.layout,
    place,
    visits: input.visits,
    deckTabs: () => input.deckTabsRef.current,
    activeTab: () => core.activeTabRef.current,
  });

  const saved: OpenSavedSessionDeps = {
    openSessions: () => sessionsRef.current,
    commitSessions: (next) => {
      sessionsRef.current = next;
      setSessions(next);
    },
    loader: core.loader,
    repair: (restored) => repairSession(restored, { persist: false }),
    updateSessions: (update) => updateSessionState(sessionsRef, setSessions, update),
    opening: core.openingSessionIds.current,
    cache: core.loadedSessionCache.current,
    isRemoving: (sessionId) => core.removingSessionIds.current.has(sessionId),
    persistence: core.persistence,
    refreshHistory: () => void core.refreshHistory(sidebarCwdRef.current),
    bindProvider: (restored) => {
      if (restored.worktreeRemoved || !restored.providerSessionId || !isLiveHarness(restored.harness)) return;
      bindHarnessSession(
        restored.harness,
        restored.id,
        restored.providerSessionId,
        sessionWorkCwd(restored),
        restored.providerAccountId,
        restored.blocks,
      );
    },
  };
  const sessionOpeners = createSessionOpenerActions({ focus: input.tabFlows.focus, saved, pane });

  return { sessionList, place, tabActions, sessionOpeners };
}

export type SessionOpenerFlows = ReturnType<typeof createSessionOpenerFlows>;

/** Pane focus, tab actions and the saved-session openers, created once. */
export function useSessionOpenerFlows(core: WorkspaceFlowCore, input: SessionOpenerFlowsInput): SessionOpenerFlows {
  return useStableFlow(() => createSessionOpenerFlows(core, input));
}
