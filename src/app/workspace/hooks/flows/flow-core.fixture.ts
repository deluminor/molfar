import { vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { FamiliarView } from "../../flows/familiars/familiar-view";
import type { SessionPersistence } from "../../flows/session-history/session-persistence";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceInitialState } from "../../store/types";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

/** A flow core over a real store, with every callback a kept `vi.fn`. */
export function fakeFlowCore(state: Partial<WorkspaceInitialState> = {}): WorkspaceFlowCore {
  const store = createWorkspaceStore(testWorkspaceState(state));
  const sessionsRef = { current: store.getState().sessions };
  const persistence = {
    persist: vi.fn(),
    forgetSaved: vi.fn(),
  } as unknown as SessionPersistence;

  return {
    store,
    sessionsRef,
    setSessions: vi.fn((update: Session[] | ((current: Session[]) => Session[])) => {
      sessionsRef.current = typeof update === "function" ? update(sessionsRef.current) : update;
    }),
    tabsRef: { current: store.getState().tabs },
    setTabs: vi.fn(),
    activeTabIdRef: { current: store.getState().activeTabId },
    projectCwdRef: { current: store.getState().projectCwd },
    sidebarCwdRef: { current: store.getState().projectCwd },
    gitCwdRef: { current: store.getState().projectCwd },
    sessionDefaultsRef: { current: undefined },
    activeTabRef: { current: undefined },
    insetLayoutRef: { current: false },
    persistence,
    loader: { load: vi.fn(async () => null), prefetch: vi.fn(), invalidate: vi.fn(), loadingIds: vi.fn(() => []) },
    loadedSessionCache: { current: new Map() },
    openingSessionIds: { current: new Set() },
    removingSessionIds: { current: new Set() },
    switchingWorktrees: { current: new Map() },
    removingWorktreePaths: { current: new Set() },
    workspacePins: { current: new Map() },
    familiarView: { open: vi.fn(async () => undefined), close: vi.fn() } as unknown as FamiliarView,
    navigation: { cancel: vi.fn() },
    setActiveTabId: vi.fn(),
    selectTab: vi.fn(),
    setComposerFocused: vi.fn(),
    setAutomationsViewOpen: vi.fn(),
    setSidebarTab: vi.fn(),
    leaveCoveringFamiliar: vi.fn(),
    refreshHistory: vi.fn(async () => undefined),
    stopSessionForRemoval: vi.fn(async () => undefined),
    projectOfTab: vi.fn(() => undefined),
    tabWorkspace: vi.fn(() => null),
  };
}
