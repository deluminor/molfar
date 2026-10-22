import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { newTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { removeSession, type RemoveSessionDeps } from "./remove-session";

const remover = vi.hoisted(() => ({ remove: vi.fn(async () => true) }));

vi.mock("@/features/sessions/model/session-removal", () => ({
  createSessionRemover: () => remover,
}));
vi.mock("../session-history/unused-worktree", () => ({
  findUnusedSessionWorktree: async () => undefined,
}));
vi.mock("@/shared/lib/app-dialog", () => ({ alertApp: vi.fn(async () => undefined), confirmApp: vi.fn() }));

function setup(sessions: Session[] = [{ ...testSession("claude", "/work/demo"), id: "s" }]) {
  const store = createWorkspaceStore(testWorkspaceState({ sessions }));
  const deps = {
    store,
    sessionsRef: { current: sessions },
    tabsRef: { current: [{ ...newTab("s"), id: "t" }] },
    activeTabIdRef: { current: "t" },
    dirtyFiles: () => new Set<string>(),
    removingSessionIds: { current: new Set<string>() },
    switchingWorktrees: { current: new Map<string, string>() },
    deleteConfirmationPending: { current: false },
    persistence: { dropPending: vi.fn() },
    removalChange: {} as never,
    invalidateLoadedSession: vi.fn(),
    sidebarCwd: () => "/work/demo",
    stopSessionForRemoval: vi.fn(async () => undefined),
    removeWorktree: vi.fn(async () => undefined),
  } satisfies RemoveSessionDeps;
  return { deps };
}

describe("removeSession", () => {
  it("archives a session and releases its lock", async () => {
    const { deps } = setup();

    expect(await removeSession(deps, "s", "archive")).toBe(true);

    expect(deps.invalidateLoadedSession).toHaveBeenCalledWith("s");
    expect(deps.removingSessionIds.current.size).toBe(0);
  });

  it("skips a session already being removed", async () => {
    const { deps } = setup();
    deps.removingSessionIds.current.add("s");
    remover.remove.mockClear();

    expect(await removeSession(deps, "s", "delete")).toBe(false);
    expect(remover.remove).not.toHaveBeenCalled();
  });

  it("throws a failure back to the CLI instead of showing it", async () => {
    const { deps } = setup();
    remover.remove.mockRejectedValueOnce(new Error("locked"));

    await expect(removeSession(deps, "s", "delete", true, "cli")).rejects.toThrow("locked");
    expect(deps.removingSessionIds.current.size).toBe(0);
  });
});
