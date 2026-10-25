import { beforeEach, describe, expect, it, vi } from "vitest";
import { session, setupWorktrees, tree } from "./worktree.fixture";
import { removeSessionWorktree } from "./worktree-removal";

const git = vi.hoisted(() => ({
  listed: [] as unknown[],
  removed: { sessionIds: [] as string[], projectCwd: "/work/demo" },
  remove: vi.fn(),
}));

vi.mock("@/features/source-control/model/worktrees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/source-control/model/worktrees")>()),
  checkWorktreeRemoval: vi.fn(async () => undefined),
  listWorktrees: async () => ({ worktrees: git.listed }),
  removeWorktree: async (...args: unknown[]) => {
    git.remove(...args);
    return git.removed;
  },
}));
vi.mock("@/features/sessions/data/session-store", () => ({
  flushSessionWrites: vi.fn(async () => undefined),
  shouldPersistSession: () => false,
  upsertSession: vi.fn(async () => undefined),
}));
vi.mock("@/features/sessions/model/checkpoint", () => ({
  flushSessionCheckpoint: vi.fn(async () => undefined),
  notifyReviewChanged: vi.fn(),
}));
vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  forgetHarnessSession: vi.fn(async () => undefined),
}));
vi.mock("../../../model/app-lifecycle", () => ({ bindResumedSessions: vi.fn() }));

const wt = "/work/demo-wt";

beforeEach(() => {
  git.remove.mockReset();
  git.removed = { sessionIds: [], projectCwd: "/work/demo" };
});

describe("removeSessionWorktree", () => {
  it("refuses while sessions still use the worktree", async () => {
    git.listed = [tree(wt, ["s"])];
    const { deps } = setupWorktrees([session({ worktreeCwd: wt })]);

    await expect(removeSessionWorktree(deps, "/work/demo", wt, false)).rejects.toThrow(
      "Move or delete the sessions using this worktree first.",
    );
    expect(git.remove).not.toHaveBeenCalled();
    expect(deps.removingWorktreePaths.current.size).toBe(0);
  });

  it("refuses while a session is selecting it", async () => {
    const { deps } = setupWorktrees();
    deps.switchingWorktrees.current.set("x", wt);

    await expect(removeSessionWorktree(deps, "/work/demo", wt, false)).rejects.toThrow(
      "A session is selecting this worktree",
    );
  });

  it("keeps its sessions, detached back to the project", async () => {
    git.listed = [tree(wt, ["s"])];
    git.removed = { sessionIds: ["s"], projectCwd: "/work/demo" };
    const { deps, sessions } = setupWorktrees([session({ worktreeCwd: wt, busy: true })]);

    await removeSessionWorktree(deps, "/work/demo", wt, false, true);

    expect(git.remove).toHaveBeenCalledWith("/work/demo", wt, false, true);
    expect(deps.stopSessionForRemoval).toHaveBeenCalledWith("s");
    expect(sessions()[0]).toMatchObject({ busy: false, queueStatus: "paused" });
    expect(sessions()[0]).toMatchObject({ cwd: "/work/demo", worktreeRemoved: true });
    expect(deps.persistence.forgetSaved).toHaveBeenCalledWith("s");
    expect(deps.removingSessionIds.current.size).toBe(0);
  });
});
