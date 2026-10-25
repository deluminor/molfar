import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Block } from "@/domain/session/block";
import type { Session } from "@/domain/session/session";
import type { Habit } from "@/features/familiars/model/familiar-habits";
import { testSession } from "@/integrations/harness/core/test-session";
import { createFamiliarChat } from "./familiar-chat";
import { createFamiliarHabitHost, type FamiliarHabitHostDeps } from "./habit-host";

const io = vi.hoisted(() => ({
  deleteSession: vi.fn(async () => undefined),
  forget: vi.fn(async () => undefined),
  announce: vi.fn(async () => undefined),
}));

vi.mock("@/features/sessions/data/session-store", () => ({ deleteSession: io.deleteSession }));
vi.mock("@/features/notifications/model/notifications", () => ({ announceSessionFinished: io.announce }));
vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  forgetHarnessSession: io.forget,
}));

const habit = { id: "h1", name: "Morning check" } as Habit;

function session(id: string, patch: Partial<Session> = {}): Session {
  return { ...testSession("claude", "/work/demo"), id, ...patch };
}

function setup(initial: Session[] = [session("familiar")]) {
  const sessionsRef = { current: initial };
  const commitSessions = vi.fn((next: Session[]) => {
    sessionsRef.current = next;
  });
  const chat = createFamiliarChat({
    openSessions: () => sessionsRef.current,
    commitSessions,
    persist: vi.fn(),
    schedule: vi.fn(),
  });
  const deps = {
    sessionsRef,
    activeSessionIdRef: { current: "other" as string | undefined },
    chat,
    commitSessions,
    ensureOpenSession: vi.fn(async (): Promise<Session | null> => null),
    submitSession: vi.fn((_id, _prompt, _attachments, options) => {
      options?.onSettled?.({ status: "completed", text: "done" });
      return true;
    }),
    stopSessionForRemoval: vi.fn(async (): Promise<Session | undefined> => undefined),
    noteReply: vi.fn(),
  } satisfies FamiliarHabitHostDeps;
  const blocksOf = (id: string) => sessionsRef.current.find((entry) => entry.id === id)?.blocks ?? [];

  return { deps, host: createFamiliarHabitHost(deps), blocksOf };
}

describe("familiar habit host", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens a saved session, or reports it missing", async () => {
    const { deps, host } = setup();
    expect(await host.open("gone")).toBeUndefined();

    const saved = session("saved");
    deps.ensureOpenSession.mockResolvedValueOnce(saved);
    expect(await host.open("saved")).toBe(saved);
  });

  it("adds a hidden run session to the open sessions", () => {
    const { deps, host } = setup();
    host.add(session("run"));
    expect(deps.sessionsRef.current.map((entry) => entry.id)).toEqual(["familiar", "run"]);
  });

  it("runs a prompt and resolves with how the turn settled", async () => {
    const { deps, host } = setup();
    await expect(host.run("run", "Check the inbox")).resolves.toEqual({ status: "completed", text: "done" });
    expect(deps.submitSession).toHaveBeenCalledWith("run", "Check the inbox", [], expect.any(Object));
  });

  it("removes a run session: stops it, forgets its harnesses, deletes it", async () => {
    const run = session("run");
    const { deps, host } = setup([session("familiar"), run]);
    deps.stopSessionForRemoval.mockResolvedValueOnce(run);

    await host.remove("run");

    expect(io.forget).toHaveBeenCalledWith("claude", "run");
    expect(io.deleteSession).toHaveBeenCalledWith("run", []);
    expect(deps.sessionsRef.current.map((entry) => entry.id)).toEqual(["familiar"]);
  });

  it("deletes a run session that was never open without touching harnesses", async () => {
    const { host } = setup();
    await host.remove("closed");
    expect(io.forget).not.toHaveBeenCalled();
    expect(io.deleteSession).toHaveBeenCalledWith("closed", []);
  });

  it("posts a habit message with its artifacts and announces it", () => {
    const { deps, host, blocksOf } = setup();
    host.post("familiar", habit, "All quiet", "Morning check", [{ id: "a" } as never]);

    const [posted] = blocksOf("familiar");
    expect(posted).toMatchObject({ role: "assistant", text: "All quiet", familiarHabit: { id: "h1" } });
    expect(posted?.artifactCards).toHaveLength(1);
    expect(posted?.familiarSpawnedSessions).toBeUndefined();
    expect(deps.noteReply).toHaveBeenCalledWith("familiar");
    expect(io.announce).toHaveBeenCalledWith(expect.objectContaining({ title: "Morning check" }), false);
  });

  it("announces a post to the focused Familiar as focused", () => {
    const { deps, host } = setup();
    deps.activeSessionIdRef.current = "familiar";
    host.post("familiar", habit, "Hi", "Morning check");
    expect(io.announce).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("relays a run's approval into the chat and cancels it when the run ends", () => {
    const { host, blocksOf } = setup();
    const block = { id: "b", role: "approval", text: "Run tests?", approval: { requestId: 7 } } as unknown as Block;

    host.askApproval("familiar", habit, "run-1", block);
    const [relayed] = blocksOf("familiar");
    expect(relayed).toMatchObject({ role: "approval", text: "Run tests?" });
    expect(relayed?.approval?.decided).toBeUndefined();

    host.endApprovals("run-1");
    expect(blocksOf("familiar")[0]?.approval?.decided).toBe("cancelled");
  });

  it("ignores a block without an approval request", () => {
    const { host, blocksOf } = setup();
    host.askApproval("familiar", habit, "run-1", { id: "b", role: "assistant", text: "" } as Block);
    expect(blocksOf("familiar")).toHaveLength(0);
  });
});
