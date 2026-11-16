import { describe, expect, it, vi } from "vitest";
import type { HostSession } from "@/domain/remote/protocol";
import type { Session } from "@/domain/session/session";
import type { RemoteProject } from "@/features/connections/model/remote-projects";
import { testSession } from "@/integrations/harness/core/test-session";
import { createRemoteSnapshotSync } from "./remote-snapshot";

const project: RemoteProject = { key: "env:/repo", environmentId: "env", projectId: "p", cwd: "/repo" };

vi.mock("@/features/connections/model/remote-projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/connections/model/remote-projects")>()),
  remoteProjectFor: (path: string) => (path === "remote-shell" ? project : undefined),
}));

function setup(cwd = "remote-shell") {
  let sessions: Session[] = [{ ...testSession("claude", cwd), id: "shell", title: "Shell" }];
  const setSessions = vi.fn((update: (current: Session[]) => Session[]) => {
    sessions = update(sessions);
  });
  return { sync: createRemoteSnapshotSync(setSessions), setSessions, sessions: () => sessions };
}

function snapshot(title: string): HostSession {
  return {
    session: { ...testSession("claude", "/repo"), id: "host", title, busy: true },
    projectId: "p",
    revision: 1,
    status: "running",
    updatedAt: 1,
  };
}

describe("createRemoteSnapshotSync", () => {
  it("applies a new snapshot to its shell, keeping the shell id and cwd", () => {
    const { sync, sessions } = setup();

    sync("shell", snapshot("Remote work"));

    expect(sessions()[0]).toMatchObject({ id: "shell", cwd: "remote-shell", title: "Remote work", busy: true });
    expect(sessions()[0].worktreeCwd).toBeUndefined();
  });

  it("skips a repeated snapshot until it is cleared", () => {
    const { sync, setSessions, sessions } = setup();
    const same = snapshot("Remote work");

    sync("shell", same);
    sync("shell", same);
    expect(setSessions).toHaveBeenCalledOnce();

    sync("shell");
    expect(sessions()[0]).toMatchObject({ title: "New remote session", blocks: [], busy: false });
    sync("shell", same);
    expect(sessions()[0].title).toBe("Remote work");
  });

  it("leaves sessions alone for an unknown shell or project", () => {
    const local = setup("/work/local");
    local.sync("shell", snapshot("Remote work"));
    expect(local.sessions()[0].title).toBe("Shell");

    const missing = setup();
    const before = missing.sessions();
    missing.sync("other", snapshot("Remote work"));
    expect(missing.sessions()).toBe(before);
  });
});
