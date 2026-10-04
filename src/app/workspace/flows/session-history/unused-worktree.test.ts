import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/session/session";
import type { Worktree } from "@/features/source-control/model/worktrees";
import { testSession } from "@/integrations/harness/core/test-session";
import { findUnusedSessionWorktree } from "./unused-worktree";

function tree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: "/work/demo-worktrees/fix",
    branch: "molfar/fix",
    head: "abc",
    isMain: false,
    locked: false,
    prunable: false,
    missing: false,
    dirty: false,
    unpushed: 0,
    sessionIds: [],
    ...overrides,
  };
}

function inWorktree(id: string): Session {
  return {
    ...testSession("claude", "/work/demo"),
    id,
    worktreeCwd: "/work/demo-worktrees/fix",
  };
}

const owner = { cwd: "/work/demo", worktreeCwd: "/work/demo-worktrees/fix" };
const listing = (worktree: Worktree) => async () => ({
  worktrees: [worktree],
  defaultRoot: "/work/demo-worktrees",
});

describe("findUnusedSessionWorktree", () => {
  it("offers a branch worktree only this session uses", async () => {
    expect(
      await findUnusedSessionWorktree(
        "s1",
        owner,
        [inWorktree("s1")],
        listing(tree()),
      ),
    ).toBe("/work/demo-worktrees/fix");
  });

  it("keeps a worktree another open session uses", async () => {
    expect(
      await findUnusedSessionWorktree(
        "s1",
        owner,
        [inWorktree("s1"), inWorktree("s2")],
        listing(tree()),
      ),
    ).toBeUndefined();
  });

  it.each([
    ["the main checkout", { isMain: true }],
    ["a locked worktree", { locked: true }],
    ["a detached worktree", { branch: null }],
  ])("keeps %s", async (_, overrides) => {
    expect(
      await findUnusedSessionWorktree(
        "s1",
        owner,
        [],
        listing(tree(overrides)),
      ),
    ).toBeUndefined();
  });

  it("offers nothing for a session outside a worktree or when listing fails", async () => {
    expect(
      await findUnusedSessionWorktree(
        "s1",
        { cwd: "/work/demo" },
        [],
        listing(tree()),
      ),
    ).toBeUndefined();
    expect(
      await findUnusedSessionWorktree("s1", owner, [], async () => {
        throw new Error("git failed");
      }),
    ).toBeUndefined();
  });
});
