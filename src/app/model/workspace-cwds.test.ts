import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { FilePaneTab } from "@/features/workspace/model/layout";
import { workspaceCwds } from "./workspace-cwds";

const remote = vi.hoisted(() => ({
  project: undefined as { environmentId: string; cwd: string } | undefined,
  checkout: undefined as string | undefined,
}));

vi.mock("@/features/connections/model/remote-projects", () => ({
  remoteProjectFor: () => remote.project,
  remotePath: (environmentId: string, path: string) => `remote://${environmentId}${path}`,
  remoteSessionGitCwd: (_project: unknown, gitCwd: string, root: string, checkout?: string) =>
    `git:${checkout ?? gitCwd ?? root}`,
}));
vi.mock("@/features/connections/model/connections", () => ({
  remoteTabCwd: () => remote.checkout,
}));

const chat = (cwd: string, worktreeCwd?: string) =>
  ({ id: "s", cwd, worktreeCwd }) as unknown as Session;

afterEach(() => {
  remote.project = undefined;
  remote.checkout = undefined;
});

describe("workspaceCwds", () => {
  it("follows the chat's worktree for git and files, its project for the sidebar", () => {
    const cwds = workspaceCwds({
      activeFile: undefined,
      active: chat("/repo", "/repo-wt"),
      projectCwd: "/other",
      insetLayout: false,
    });

    expect(cwds).toMatchObject({
      sidebarCwd: "/repo",
      gitCwd: "/repo-wt",
      filesCwd: "/repo-wt",
      gitRootCwd: "/repo-wt",
      appViewScope: undefined,
    });
  });

  it("follows a focused file's folder and project, scoping inset app views to that project", () => {
    const file = { cwd: "/repo/pkg", projectCwd: "/repo" } as FilePaneTab;
    const cwds = workspaceCwds({ activeFile: file, active: undefined, projectCwd: "/p", insetLayout: true });

    expect(cwds.sidebarCwd).toBe("/repo");
    expect(cwds.gitCwd).toBe("/repo/pkg");
    expect(cwds.terminalCwd).toBe("/repo/pkg");
    expect(cwds.appViewScope).toBe("/repo");
  });

  it("falls back to the project when nothing is focused and never scopes the home folder", () => {
    const cwds = workspaceCwds({ activeFile: undefined, active: undefined, projectCwd: "~", insetLayout: true });

    expect(cwds.sidebarCwd).toBe("~");
    expect(cwds.gitCwd).toBe("~");
    expect(cwds.appViewScope).toBeUndefined();
  });

  it("keeps a remote work path and maps a host path to the tab's checkout", () => {
    remote.project = { environmentId: "env", cwd: "/host" };
    const remoteChat = workspaceCwds({
      activeFile: undefined,
      active: chat("remote://env/host"),
      projectCwd: "/p",
      insetLayout: false,
    });
    expect(remoteChat.filesCwd).toBe("remote://env/host");

    remote.checkout = "/host-wt";
    const file = { cwd: "/host/pkg", projectCwd: "remote://env/host" } as FilePaneTab;
    const cwds = workspaceCwds({ activeFile: file, active: chat("x"), projectCwd: "/p", insetLayout: false });

    expect(cwds.filesCwd).toBe("remote://env/host-wt");
    expect(cwds.gitRootCwd).toBe("git:/host-wt");
  });
});
