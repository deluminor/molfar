import { vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { Worktree } from "@/features/source-control/model/worktrees";
import { newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorktreeDeps } from "./worktree-deps";

export const tree = (path: string, sessionIds: string[] = []): Worktree => ({
  path,
  branch: "feature",
  head: "abc",
  isMain: false,
  locked: false,
  prunable: false,
  missing: false,
  dirty: false,
  unpushed: 0,
  sessionIds,
});

export const session = (patch: Partial<Session> = {}): Session => ({
  ...testSession("claude", "/work/demo"),
  id: "s",
  ...patch,
});

/** Worktree deps over a store in `/work/demo`. */
export function setupWorktrees(sessions: Session[] = [session()], tabs: WorkspaceTab[] = []) {
  const store = createWorkspaceStore(testWorkspaceState({ sessions, tabs, projectCwd: "/work/demo" }));
  const sessionsRef = { current: sessions };
  const tabsRef = { current: tabs };
  const deps = {
    store,
    sessionsRef,
    setSessions: (update) => {
      sessionsRef.current = typeof update === "function" ? update(sessionsRef.current) : update;
    },
    tabsRef,
    setTabs: (update) => {
      tabsRef.current = typeof update === "function" ? update(tabsRef.current) : update;
    },
    projectTerminals: () => [],
    projectCwd: () => store.getState().projectCwd,
    removingSessionIds: { current: new Set<string>() },
    switchingWorktrees: { current: new Map<string, string>() },
    removingWorktreePaths: { current: new Set<string>() },
    workspacePins: { current: new Map<string, string>() },
    persistence: { dropPending: vi.fn(), forgetSaved: vi.fn(), persist: vi.fn() },
    invalidateLoadedSession: vi.fn(),
    stopSessionForRemoval: vi.fn(async (id: string) => sessionsRef.current.find((s) => s.id === id)),
    appendTab: vi.fn(),
    openSessionTab: vi.fn((opened: Session) => newTab(opened.id)),
    selectTab: vi.fn(),
    focusComposer: vi.fn(),
    refreshHistory: vi.fn(async () => undefined),
    projectOfTab: () => undefined,
  } satisfies WorktreeDeps;

  return { deps, store, sessions: () => sessionsRef.current };
}
