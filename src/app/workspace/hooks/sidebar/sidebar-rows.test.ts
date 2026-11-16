import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/session/session";
import { newDefaultSession } from "@/features/sessions/model/session";
import { newTab } from "@/features/workspace/model/layout";
import {
  busyProjectPaths,
  openProjectSessionRows,
  projectGitHint,
  worktreeTabStats,
} from "./sidebar-rows";

function session(cwd: string, patch: Partial<Session> = {}): Session {
  return { ...newDefaultSession(cwd), ...patch };
}

describe("projectGitHint", () => {
  it("labels a project with its repo and current branch", () => {
    expect(projectGitHint("/work/demo", "main")).toEqual({ repo: "demo", branch: "main" });
  });

  it("drops the repo outside a project and the branch when unknown", () => {
    expect(projectGitHint("~", undefined)).toEqual({});
  });
});

describe("worktreeTabStats", () => {
  it("counts the project's tabs per workspace and marks a busy one", () => {
    const idle = session("/work/demo");
    const busy = session("/work/demo", { busy: true });
    const other = session("/work/other");
    const tabs = [newTab(idle.id), newTab(busy.id), newTab(other.id)];
    const tabWorkspace = (tab: (typeof tabs)[number]) =>
      tab.id === tabs[1]?.id ? "/work/demo-wt" : null;

    const stats = worktreeTabStats(tabs, [idle, busy, other], "/work/demo", tabWorkspace);

    expect([...stats.entries()]).toEqual([
      ["/work/demo", { tabs: 1, busy: false }],
      ["/work/demo-wt", { tabs: 1, busy: true }],
    ]);
  });

  it("is empty outside a local project", () => {
    expect(worktreeTabStats([], [], "~", () => null).size).toBe(0);
    expect(worktreeTabStats([], [], "", () => null).size).toBe(0);
  });
});

describe("openProjectSessionRows", () => {
  it("lists the project's own open chats, without Inbox asks, hidden runs or workers", () => {
    const own = session("/work/demo");
    const sessions = [
      own,
      session("/work/demo", { inboxAsk: true } as Partial<Session>),
      session("/work/demo", { ephemeral: true }),
      session("/work/demo", { orchestrationLeadId: own.id }),
      session("/work/other"),
    ];

    const rows = openProjectSessionRows(sessions, "/work/demo", "main");

    expect(rows.map((row) => row.id)).toEqual([own.id]);
  });
});

describe("busyProjectPaths", () => {
  it("lists the folders of busy promptable sessions", () => {
    const paths = busyProjectPaths([
      session("/work/a", { busy: true }),
      session("/work/b", { busy: true, ephemeral: true }),
      session("/work/c"),
    ]);

    expect(paths).toEqual(["/work/a"]);
  });
});
