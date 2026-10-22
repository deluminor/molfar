import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import type { AgentAppDeps } from "./agent-app-deps";
import { startAppSession } from "./agent-app-launch";
import { sendAppMessage } from "./agent-app-messages";
import { listAppSessions } from "./agent-app-sessions";
import { createRequestSource } from "./agent-app-source";
import { createControlRequests } from "./control-requests";

const app = vi.hoisted(() => ({ handle: vi.fn(async () => ({ done: true })) }));

vi.mock("@/features/agent-app/model/agent-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/agent-app/model/agent-app")>()),
  handleAgentApp: app.handle,
}));
vi.mock("@/features/sessions/data/session-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/sessions/data/session-store")>()),
  getSession: vi.fn(async () => null),
  listSessionsByProject: vi.fn(async () => []),
}));

const session = (id: string, patch: Partial<Session> = {}): Session => ({
  ...testSession("claude", "/work/demo"),
  id,
  ...patch,
});

function setup(sessions: Session[]) {
  const sessionsRef = { current: sessions };
  const deps = {
    sessionsRef,
    setSessions: (update) => {
      sessionsRef.current = typeof update === "function" ? update(sessionsRef.current) : update;
    },
    turnGen: { current: new Map<string, number>() },
    removingSessionIds: { current: new Set<string>() },
    switchingWorktrees: { current: new Map<string, string>() },
    completions: { watch: vi.fn(), dismissSession: vi.fn() } as never,
    board: () => undefined as never,
    flushHarnessEvents: vi.fn(),
    ensureOpenSession: vi.fn(async (id: string) => sessionsRef.current.find((entry) => entry.id === id)),
    submitSession: vi.fn(() => true),
    saveDraft: vi.fn(() => true),
    stopSession: vi.fn(),
    removeSession: vi.fn(async () => true),
    launchQuickSession: vi.fn(async () => undefined),
  } satisfies AgentAppDeps;
  return { deps, sessions: () => sessionsRef.current };
}

const payload = (input: object, requestId = "r1") => ({
  id: "c",
  namespace: "app",
  sessionId: "src",
  requestId,
  action: "sessions.list",
  input,
});

beforeEach(() => app.handle.mockClear());

describe("control requests", () => {
  it("answers a retried request id with its first answer", async () => {
    const { deps } = setup([session("src")]);
    const handle = createControlRequests(deps);

    await handle(payload({}));
    await handle(payload({}));

    expect(app.handle).toHaveBeenCalledTimes(1);
  });

  it("refuses a reused request id with other input", async () => {
    const { deps } = setup([session("src")]);
    const handle = createControlRequests(deps);
    await handle(payload({}));

    await expect(handle(payload({ cwd: "/other" }))).rejects.toThrow("already used with different input");
  });

  it("refuses an inbox ask session", async () => {
    const { deps } = setup([session("src", { inboxAsk: { key: "k", title: "t", url: "u", provider: "github" } })]);

    await expect(createControlRequests(deps)(payload({}))).rejects.toThrow("cannot use the MOLFAR app CLI");
  });
});

describe("app sessions", () => {
  it("starts a session once per request id", async () => {
    const { deps } = setup([session("src")]);
    const request = createRequestSource(deps, session("src"));
    const launch = { cwd: "/work/demo", prompt: "Write docs", harness: "claude", model: "" } as never;

    await startAppSession(deps, request, launch, "app-src-r1");

    expect(deps.launchQuickSession).toHaveBeenCalledWith(launch, "app-src-r1", undefined, undefined, undefined);
  });

  it("refuses a follow-up to a busy session", async () => {
    const { deps } = setup([session("src"), session("t", { busy: true })]);
    const request = createRequestSource(deps, session("src"));

    await expect(sendAppMessage(deps, request, "t", "next", "r1")).rejects.toThrow("Session is busy");
  });

  it("lists open sessions of the project", async () => {
    const { deps } = setup([session("a", { busy: true }), session("b", { cwd: "/work/other" })]);

    const listed = await listAppSessions(deps, "/work/demo");

    expect(listed.map((entry) => [entry.id, entry.busy])).toEqual([["a", true]]);
  });
});
