// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { mountHook } from "../../testing/mount-hook";
import { useFamiliarThreadMigration } from "./use-familiar-thread-migration";

const mocks = vi.hoisted(() => ({
  familiars: [] as { sessionId?: string }[],
  saved: new Map<string, unknown>(),
  migrate: vi.fn(async (_input: unknown) => undefined),
}));

vi.mock("@/features/familiars/model/familiar", () => ({ listFamiliars: () => mocks.familiars }));
vi.mock("@/features/sessions/data/session-store", () => ({
  getSession: async (id: string) => mocks.saved.get(id),
}));
vi.mock("@/integrations/harness", () => ({ migrateFamiliarCodexSession: mocks.migrate }));
vi.mock("@/domain/session/session-state", () => ({ sessionWorkCwd: (session: Session) => session.cwd }));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  vi.clearAllMocks();
  mocks.familiars = [];
  mocks.saved.clear();
});

const codexChat = (id: string, extra: Partial<Record<string, unknown>> = {}): Session =>
  ({
    id,
    cwd: "/f",
    harness: "codex",
    providerSessionId: `thread-${id}`,
    providerAccountId: "acct",
    blocks: [
      { btwThreads: [{ providerThreadId: `btw-${id}` }, { harness: "claude", providerThreadId: "skip" }] },
    ],
    ...extra,
  }) as unknown as Session;

async function run(open: Session[] = []) {
  const hook = mountHook(() => useFamiliarThreadMigration("snap", { current: open }));
  await act(async () => undefined);
  return hook;
}

describe("useFamiliarThreadMigration", () => {
  it("migrates a saved Familiar's chat thread and its Codex side-question threads", async () => {
    mocks.familiars = [{ sessionId: "a" }, {}];
    mocks.saved.set("a", codexChat("a"));
    await run();

    expect(mocks.migrate.mock.calls.map(([input]) => input)).toEqual([
      { sessionId: "a", threadId: "thread-a", cwd: "/f", providerAccountId: "acct" },
      { sessionId: "a", threadId: "btw-a", cwd: "/f", providerAccountId: "acct" },
    ]);
  });

  it("prefers the open chat and skips it while it runs", async () => {
    mocks.familiars = [{ sessionId: "a" }];
    await run([codexChat("a", { busy: true })]);

    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it("skips a chat without a real folder", async () => {
    mocks.familiars = [{ sessionId: "a" }];
    await run([codexChat("a", { cwd: "~" })]);

    expect(mocks.migrate).not.toHaveBeenCalled();
  });

  it("keeps going after a failed migration", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.familiars = [{ sessionId: "a" }, { sessionId: "b" }];
    mocks.migrate.mockRejectedValueOnce(new Error("locked"));
    await run([codexChat("a", { blocks: [] }), codexChat("b", { blocks: [] })]);

    expect(mocks.migrate.mock.calls.map(([input]) => (input as { sessionId: string }).sessionId)).toEqual(["a", "b"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
