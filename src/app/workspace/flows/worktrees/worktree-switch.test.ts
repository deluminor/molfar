import { describe, expect, it, vi } from "vitest";
import { session, setupWorktrees, tree } from "./worktree.fixture";
import { changeWorktree } from "./worktree-switch";

const git = vi.hoisted(() => ({ listed: [] as unknown[] }));

vi.mock("@/features/source-control/model/worktrees", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/source-control/model/worktrees")>()),
  listWorktrees: async () => ({ worktrees: git.listed }),
}));
vi.mock("@/features/sessions/data/session-store", () => ({
  shouldPersistSession: () => false,
  upsertSession: vi.fn(async () => undefined),
}));
vi.mock("@/features/sessions/model/checkpoint", () => ({
  flushSessionCheckpoint: vi.fn(async () => undefined),
  keepSessionChanges: vi.fn(async () => undefined),
  notifyReviewChanged: vi.fn(),
}));
vi.mock("@/platform/tauri/fs", () => ({ notifyGitChanged: vi.fn() }));

const wt = "/work/demo-wt";

describe("changeWorktree", () => {
  it("moves a blank session into the worktree", async () => {
    git.listed = [tree(wt)];
    const { deps, sessions } = setupWorktrees();

    await changeWorktree(deps, "s", tree(wt), true);

    expect(sessions()[0].worktreeCwd).toBe(wt);
    expect(deps.workspacePins.current.get("s")).toBe("/work/demo");
    expect(deps.switchingWorktrees.current.size).toBe(0);
    expect(deps.refreshHistory).toHaveBeenCalledWith("/work/demo");
  });

  it("continues a conversation in the worktree as a new session in its own tab", async () => {
    git.listed = [tree(wt)];
    const { deps, sessions } = setupWorktrees([
      session({ blocks: [{ id: "u", role: "user", text: "hi" }] }),
    ]);

    await changeWorktree(deps, "s", tree(wt));

    expect(sessions()).toHaveLength(2);
    expect(sessions()[1].worktreeCwd).toBe(wt);
    expect(deps.appendTab).toHaveBeenCalled();
    expect(deps.focusComposer).toHaveBeenCalled();
  });

  it("does nothing when the session already runs there, even with queued messages", async () => {
    const { deps } = setupWorktrees([
      session({ worktreeCwd: wt, queuedMessages: [{ id: "q", text: "x", attachments: [] }] }),
    ]);

    await changeWorktree(deps, "s", tree(wt));

    expect(deps.switchingWorktrees.current.size).toBe(0);
  });

  it("refuses a busy session and a worktree being deleted", async () => {
    const busy = setupWorktrees([session({ busy: true })]);
    const deleting = setupWorktrees();
    deleting.deps.removingWorktreePaths.current.add(wt);

    await expect(changeWorktree(busy.deps, "s", tree(wt))).rejects.toThrow("Wait for this session");
    await expect(changeWorktree(deleting.deps, "s", tree(wt))).rejects.toThrow("being deleted");
  });
});
