import { vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { ProjectDeps } from "./project-deps";

export const projectSession = (id: string, cwd: string, patch: Partial<Session> = {}): Session => ({
  ...testSession("claude", cwd),
  id,
  ...patch,
});

/** Project deps over a store in `/work/demo` with the given sessions and tabs. */
export function setupProjects(sessions: Session[], tabs: WorkspaceTab[]) {
  const store = createWorkspaceStore(
    testWorkspaceState({ sessions, tabs, activeTabId: tabs[0]?.id ?? "", projectCwd: "/work/demo" }),
  );
  const sessionsRef = { current: sessions };
  const tabsRef = { current: tabs };
  const deps = {
    store,
    sessionsRef,
    setSessions: (update) => {
      sessionsRef.current = typeof update === "function" ? update(sessionsRef.current) : update;
    },
    tabsRef,
    activeTabIdRef: { current: tabs[0]?.id ?? "" },
    projectCwdRef: { current: "/work/demo" },
    projectTerminalsRef: { current: [] },
    turnGen: { current: new Map<string, number>() },
    loadedSessionCache: { current: new Map<string, Session>() },
    loadingSessionIds: () => [],
    invalidateLoadedSession: vi.fn(),
    persistence: { dropPending: vi.fn(), forgetSaved: vi.fn(), mapPending: vi.fn(), persist: vi.fn() },
    setSidebarTabSelection: vi.fn(),
    sidebarCwd: () => "/work/demo",
    closeAutomations: vi.fn(),
    closeFamiliarView: vi.fn(),
    navigation: { cancel: vi.fn(), selectProject: vi.fn(), selectWorkspace: vi.fn() },
    readProjectReturnMemory: () => new Map<string, string>(),
    activateTab: vi.fn(),
    insertBeside: vi.fn((tabs: WorkspaceTab[], tab: WorkspaceTab) => [...tabs, tab]),
    changeSessionProject: vi.fn(),
    selectTab: vi.fn(),
    focusComposer: vi.fn(),
    fileMoved: vi.fn(),
  } satisfies ProjectDeps;

  return { deps, store, sessions: () => sessionsRef.current, tabs: () => tabsRef.current };
}
