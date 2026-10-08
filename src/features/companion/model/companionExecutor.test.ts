// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Familiar } from "../../familiars/model/familiar";
import type { Note } from "../../notes/notes";
import type { Block, Session } from "../../sessions/model/session";
import { createCompanionExecutor, type CompanionDeps } from "./companionExecutor";
import type { CompanionOverview, CompanionTranscript } from "./protocol";

vi.mock("../../../integrations/harness/core/availability", async (original) => ({
  ...(await original<object>()),
  isHarnessAvailable: (id: string) => id === "claude" || id === "codex",
}));

function session(overrides: Partial<Session> & { id: string }): Session {
  return {
    harness: "claude",
    model: "opus",
    modelSettings: {},
    runtimeMode: "supervised",
    title: "Session",
    cwd: "/code/app",
    blocks: [],
    ...overrides,
  } as Session;
}

const block = (overrides: Partial<Block> & { id: string }): Block => ({
  role: "assistant",
  text: "",
  ...overrides,
});

const familiar: Familiar = {
  id: "fam-1",
  sessionId: "fam-session",
  name: "Vedmid",
  mascot: "ghost",
  color: "hsl(245 75% 65%)",
  projects: ["/code/app"],
};

function setup(sessions: Session[], extra: Partial<CompanionDeps> = {}) {
  const deps = {
    sessions: () => sessions,
    familiars: () => [familiar],
    projects: () => ["/code/app", "/code/site"],
    unseen: () => new Set<string>(),
    openFamiliar: vi.fn(async () => sessions.find((s) => s.id === "fam-session")),
    openSession: vi.fn(async () => undefined),
    submit: vi.fn(() => true),
    stop: vi.fn(),
    setRuntimeMode: vi.fn(),
    approve: vi.fn(),
    answer: vi.fn(),
    launch: vi.fn(async () => undefined),
    defaultRuntimeMode: () => "supervised" as const,
    vault: {
      status: vi.fn(async () => null),
      scan: vi.fn(),
      read: vi.fn(),
    },
    notes: {
      list: vi.fn(async () => [] as Note[]),
      read: vi.fn(async () => null),
      create: vi.fn(async (input) => ({ id: "n1", ...input }) as unknown as Note),
    },
    newId: () => "att-1",
    ...extra,
  } satisfies CompanionDeps;
  return { deps, handle: createCompanionExecutor(deps) };
}

beforeEach(() => localStorage.clear());

describe("overview", () => {
  it("lists Familiars with their state and project sessions busiest first", async () => {
    const { handle } = setup([
      session({
        id: "fam-session",
        busy: true,
        blocks: [block({ id: "a", text: "Looking at the failing build", streaming: true })],
      }),
      session({ id: "idle", title: "Idle one" }),
      session({
        id: "waiting",
        title: "Needs approval",
        blocks: [block({ id: "t", role: "tool", approval: { requestId: 7 }, tool: { title: "rm -rf build" } })],
      }),
      session({ id: "habit", ephemeral: true }),
    ]);
    const overview = (await handle("overview", {})) as CompanionOverview;

    expect(overview.familiars).toMatchObject([
      {
        id: "fam-1",
        name: "Vedmid",
        status: "working",
        activity: "Writing a reply",
        preview: { role: "assistant", text: "Looking at the failing build" },
        unread: false,
      },
    ]);
    expect(overview.familiars[0].mascot.rest).toMatch(/^M/);
    expect(overview.sessions.map((s) => s.id)).toEqual(["waiting", "idle"]);
    expect(overview.sessions[0]).toMatchObject({
      status: "needs-you",
      activity: "Approve rm -rf build",
      project: { path: "/code/app", name: "app" },
    });
    expect(overview.projects).toEqual([
      { path: "/code/app", name: "app", working: 0, needsYou: 1 },
      { path: "/code/site", name: "site", working: 0, needsYou: 0 },
    ]);
  });

  it("merges project history so phones see sessions that are not open tabs", async () => {
    const { handle } = setup([session({ id: "live", title: "Live tab" })], {
      sessionHistory: () => [
        {
          id: "from-disk",
          cwd: "/code/site",
          harness: "claude",
          model: "opus",
          runtimeMode: "supervised",
          title: "Saved on disk",
          createdAt: 1,
          updatedAt: 2,
          branch: "main",
        },
        {
          id: "live",
          cwd: "/code/app",
          harness: "claude",
          model: "opus",
          runtimeMode: "supervised",
          title: "Duplicate of live",
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: "archived",
          cwd: "/code/app",
          harness: "claude",
          model: "opus",
          runtimeMode: "supervised",
          title: "Old",
          createdAt: 1,
          updatedAt: 2,
          archived: true,
        },
      ],
    });
    const overview = (await handle("overview", {})) as CompanionOverview;

    expect(overview.sessions.map((entry) => entry.id)).toEqual(["live", "from-disk"]);
    expect(overview.sessions[1]).toMatchObject({
      title: "Saved on disk",
      status: "idle",
      branch: "main",
      project: { path: "/code/site", name: "site" },
    });
  });
});

describe("transcripts", () => {
  it("hides app plumbing and answers unchanged when the revision matches", async () => {
    const { handle } = setup([
      session({
        id: "fam-session",
        blocks: [
          block({ id: "u", role: "user", text: "hi", startedAt: 5 }),
          block({ id: "hidden", role: "user", text: "internal", internal: true }),
          block({ id: "draft", role: "user", text: "later", draft: true }),
          block({ id: "a", text: "hello" }),
        ],
      }),
    ]);
    const first = (await handle("familiar.transcript", {
      familiarId: "fam-1",
    })) as CompanionTranscript;
    expect(first.blocks.map((b) => b.id)).toEqual(["u", "a"]);
    expect(first.blocks[0]).toMatchObject({ at: 5 });

    expect(
      await handle("familiar.transcript", {
        familiarId: "fam-1",
        ifRevision: first.revision,
      }),
    ).toEqual({ unchanged: true, revision: first.revision });
  });

  it("keeps the latest blocks when the limit cuts the history", async () => {
    const blocks = Array.from({ length: 5 }, (_, i) => block({ id: `b${i}`, text: `${i}` }));
    const { handle } = setup([session({ id: "s", blocks })]);
    const page = (await handle("session.transcript", { sessionId: "s", limit: 2 })) as CompanionTranscript;
    expect(page.blocks.map((b) => b.id)).toEqual(["b3", "b4"]);
    expect(page.truncated).toBe(true);
  });

  it("does not expose habit runs or unknown Familiars", async () => {
    const { handle } = setup([session({ id: "run", ephemeral: true })]);
    await expect(handle("session.transcript", { sessionId: "run" })).rejects.toThrow("Session not found");
    await expect(handle("familiar.transcript", { familiarId: "nope" })).rejects.toThrow("Familiar not found");
  });
});

describe("sending", () => {
  it("sends text and photos to a Familiar", async () => {
    const { deps, handle } = setup([session({ id: "fam-session" })]);
    await handle("familiar.send", {
      familiarId: "fam-1",
      text: " look at this ",
      images: [{ name: "shot.jpg", mimeType: "image/jpeg", data: "aGVsbG8=" }],
    });
    expect(deps.submit).toHaveBeenCalledWith("fam-session", "look at this", [
      { id: "att-1", name: "shot.jpg", mimeType: "image/jpeg", kind: "image", size: 6, data: "aGVsbG8=" },
    ]);
  });

  it("rejects empty messages, foreign image types and refused submits", async () => {
    const { handle } = setup([session({ id: "s" })], { submit: vi.fn(() => false) });
    await expect(handle("session.send", { sessionId: "s", text: "  " })).rejects.toThrow("Write something");
    await expect(
      handle("session.send", {
        sessionId: "s",
        images: [{ mimeType: "image/svg+xml", data: "PHN2Zz4=" }],
      }),
    ).rejects.toThrow("Only JPEG");
    await expect(handle("session.send", { sessionId: "s", text: "go" })).rejects.toThrow("could not send");
  });
});

describe("approvals and modes", () => {
  it("answers only a pending approval, including in a Familiar's chat", async () => {
    const { deps, handle } = setup([
      session({
        id: "fam-session",
        blocks: [
          block({ id: "a1", role: "tool", approval: { requestId: 1 } }),
          block({ id: "a2", role: "tool", approval: { requestId: 2, decided: "allow" } }),
        ],
      }),
    ]);
    await handle("approval.respond", { sessionId: "fam-session", requestId: 1, decision: "allow" });
    expect(deps.approve).toHaveBeenCalledWith("fam-session", 1, "allow");
    await expect(
      handle("approval.respond", { sessionId: "fam-session", requestId: 2, decision: "deny" }),
    ).rejects.toThrow("already answered");
  });

  it("switches to any runtime mode the desktop offers", async () => {
    const { deps, handle } = setup([session({ id: "s" })]);
    await handle("session.mode", { sessionId: "s", runtimeMode: "full-access" });
    expect(deps.setRuntimeMode).toHaveBeenCalledWith("s", "full-access");
    await expect(handle("session.mode", { sessionId: "s", runtimeMode: "yolo" })).rejects.toThrow("runtimeMode");
  });
});

describe("notes", () => {
  it("filters and summarizes notes, newest first", async () => {
    const note = (id: string, title: string, updatedAt: number): Note => ({
      id,
      slug: id,
      title,
      body: `${title} body`,
      tags: [],
      createdAt: 0,
      updatedAt,
    });
    const { handle } = setup([], {
      notes: {
        list: vi.fn(async () => [note("1", "Deploy plan", 1), note("2", "Groceries", 3), note("3", "Deploy log", 2)]),
        read: vi.fn(async () => null),
        create: vi.fn(),
      },
    });
    const result = (await handle("notes.list", { query: "deploy" })) as { id: string }[];
    expect(result.map((n) => n.id)).toEqual(["3", "1"]);
  });
});

it("rejects unknown actions", async () => {
  const { handle } = setup([]);
  await expect(handle("sessions.delete", {})).rejects.toThrow("Unknown action");
});

describe("new sessions", () => {
  it("starts a quiet session in a rail project with the chosen mode", async () => {
    const { deps, handle } = setup([]);
    const result = await handle("session.start", {
      project: "/code/app",
      text: "Fix the flaky test",
      harness: "claude",
      runtimeMode: "full-access",
      workspaceMode: "worktree",
    });
    expect(result).toEqual({ sessionId: "companion-att-1" });
    expect(deps.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/code/app",
        prompt: "Fix the flaky test",
        harness: "claude",
        runtimeMode: "full-access",
        workspaceMode: "worktree",
        reveal: false,
      }),
      "companion-att-1",
    );
  });

  it("refuses projects off the rail, unknown models and empty prompts", async () => {
    const { deps, handle } = setup([]);
    await expect(
      handle("session.start", { project: "/etc", text: "hi" }),
    ).rejects.toThrow("projects on the rail");
    await expect(
      handle("session.start", { project: "/code/app", text: "hi", harness: "claude", model: "nope" }),
    ).rejects.toThrow("Unknown model");
    await expect(
      handle("session.start", { project: "/code/app", text: " " }),
    ).rejects.toThrow("Write something");
    expect(deps.launch).not.toHaveBeenCalled();
  });

  it("lists providers and defaults for a project", async () => {
    const { handle } = setup([]);
    const options = (await handle("session.options", { project: "/code/app" })) as {
      harnesses: { id: string; models: unknown[] }[];
      defaults: { runtimeMode: string };
    };
    expect(options.harnesses.find((h) => h.id === "claude")?.models.length).toBeGreaterThan(0);
    expect(options.defaults.runtimeMode).toBe("supervised");
  });
});

describe("knowledge vault", () => {
  const connection = { id: "v1", name: "Brain", root: "/vault" };
  const snapshot = {
    connection,
    entries: [],
    warnings: [],
    truncated: false,
    notes: [
      { path: "Ideas/Molfar.md", title: "Molfar", aliases: [], tags: ["ai"], links: [{ target: "Tailscale", kind: "wiki" as const }] },
      { path: "Tailscale.md", title: "Tailscale", aliases: [], tags: [], links: [] },
      { path: "Daily.md", title: "Daily", aliases: [], tags: [], links: [{ target: "Ideas/Molfar", kind: "wiki" as const }] },
    ],
  };

  it("says when no vault is connected", async () => {
    const { handle } = setup([]);
    expect(await handle("vault.index", {})).toEqual({ connected: false });
  });

  it("indexes notes and reads one with resolved links and backlinks", async () => {
    const scan = vi.fn(async () => snapshot);
    const { handle } = setup([], {
      vault: {
        status: vi.fn(async () => connection),
        scan,
        read: vi.fn(async (_id: string, path: string) => ({ path, body: "See [[Tailscale]]", revision: "r" })),
      },
    });
    const index = (await handle("vault.index", {})) as { notes: { path: string }[] };
    expect(index.notes.map((n) => n.path)).toEqual(["Daily.md", "Ideas/Molfar.md", "Tailscale.md"]);
    expect(await handle("vault.read", { path: "Ideas/Molfar.md" })).toEqual({
      path: "Ideas/Molfar.md",
      title: "Molfar",
      tags: ["ai"],
      body: "See [[Tailscale]]",
      truncated: false,
      links: [{ target: "Tailscale", path: "Tailscale.md" }],
      backlinks: [{ path: "Daily.md", title: "Daily" }],
    });
    // One scan serves both calls.
    expect(scan).toHaveBeenCalledTimes(1);
    await expect(handle("vault.read", { path: "../etc/passwd" })).rejects.toThrow("not in the vault");
  });
});
