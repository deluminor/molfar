import { describe, expect, it, vi } from "vitest";
import { changeBranch, changeWorkspaceMode, changeWorktreeBase } from "./session-checkout";
import { changeSessionProject } from "./session-project";
import { session, setupWorktrees } from "./worktree.fixture";

vi.mock("@/platform/tauri/fs", () => ({ notifyGitChanged: vi.fn() }));
vi.mock("@/features/sessions/model/checkpoint", () => ({
  keepSessionChanges: vi.fn(async () => undefined),
  notifyReviewChanged: vi.fn(),
}));
vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  forgetHarnessSession: vi.fn(async () => undefined),
}));

describe("session checkout", () => {
  it("drops the provider session when the branch changes", () => {
    const { deps, sessions } = setupWorktrees([session({ branch: "main", providerSessionId: "p" })]);

    changeBranch(deps, "s");

    expect(sessions()[0]).toMatchObject({ branch: undefined, providerSessionId: undefined });
    expect(deps.persistence.persist).toHaveBeenCalled();
  });

  it("chooses a new worktree from a base, and back to the project", () => {
    const { deps, sessions } = setupWorktrees();

    changeWorkspaceMode(deps, "s", "worktree");
    expect(sessions()[0].workspaceMode).toBeUndefined();

    changeWorkspaceMode(deps, "s", "worktree", "main");
    expect(sessions()[0]).toMatchObject({ workspaceMode: "worktree", worktreeBase: "main" });

    changeWorktreeBase(deps, "s", "develop");
    expect(sessions()[0].worktreeBase).toBe("develop");

    changeWorkspaceMode(deps, "s", "current");
    expect(sessions()[0]).toMatchObject({ workspaceMode: undefined, worktreeBase: undefined });
  });
});

describe("changeSessionProject", () => {
  it("moves a blank session into the new project", () => {
    const { deps, sessions, store } = setupWorktrees([session({ cwd: "~" })]);

    changeSessionProject(deps, "s", "/work/other");

    expect(sessions()[0].cwd).toBe("/work/other");
    expect(store.getState().projectCwd).toBe("/work/other");
  });

  it("opens a conversation's new project in a new tab instead", () => {
    const { deps, sessions } = setupWorktrees([
      session({ blocks: [{ id: "u", role: "user", text: "hi" }] }),
    ]);

    changeSessionProject(deps, "s", "/work/other");

    expect(sessions()[0].cwd).toBe("/work/demo");
    expect(deps.openSessionTab).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/work/other" }), "/work/other");
    expect(deps.focusComposer).toHaveBeenCalled();
  });
});
