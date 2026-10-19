import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Block } from "@/domain/session/block";
import type { BtwThread } from "@/domain/session/block-meta";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createBtw } from "./btw-actions";

const harness = vi.hoisted(() => ({
  run: vi.fn<(input: { prompt: string; signal: AbortSignal }) => Promise<string>>(),
}));

vi.mock("@/integrations/harness", () => ({
  runHarnessTextPrompt: (input: { prompt: string; signal: AbortSignal }) => harness.run(input),
}));

const turn: Block[] = [
  { id: "ask", role: "user", text: "Fix the build" },
  { id: "reply", role: "assistant", text: "Fixed" },
];

function setup(patch: Partial<Session> = {}) {
  let open: Session[] = [
    { ...testSession("claude", "/work/demo"), id: "s", blocks: turn, ...patch },
  ];
  const persist = vi.fn();
  const btw = createBtw({
    openSessions: () => open,
    commitSessions: (next) => {
      open = next;
    },
    persist,
  });
  const thread = (): BtwThread | undefined =>
    open[0].blocks.find((block) => block.id === "ask")?.btwThreads?.[0];

  return { btw, persist, thread, setThread: (next: BtwThread) => {
    open = [{ ...open[0], blocks: [{ ...turn[0], btwThreads: [next] }, turn[1]] }];
  } };
}

describe("createBtw", () => {
  beforeEach(() => {
    harness.run.mockReset();
  });

  it("asks a side question and stores the answer", async () => {
    harness.run.mockResolvedValue(" It was a typo. ");
    const { btw, persist, thread } = setup();

    expect(btw.submit("s", turn, "t", "m", "Why?")).toBe(true);
    expect(thread()?.status).toBe("running");
    expect(harness.run.mock.calls[0][0].prompt).toContain("User: Why?");

    await vi.waitFor(() => expect(thread()?.status).toBe("ready"));
    expect(thread()?.messages.at(-1)).toMatchObject({ role: "assistant", text: "It was a typo." });
    expect(persist).toHaveBeenCalled();
  });

  it("records a failed answer on the thread", async () => {
    harness.run.mockRejectedValue(new Error("offline"));
    const { btw, thread } = setup();

    btw.submit("s", turn, "t", "m", "Why?");

    await vi.waitFor(() => expect(thread()?.status).toBe("error"));
    expect(thread()?.error).toBe("offline");
  });

  it("needs a project directory", () => {
    const { btw, thread } = setup({ cwd: "~" });

    btw.submit("s", turn, "t", "m", "Why?");

    expect(thread()?.error).toBe("A project working directory is required for this question.");
    expect(harness.run).not.toHaveBeenCalled();
  });

  it("refuses a second question while one is running, and a removed worktree", () => {
    harness.run.mockReturnValue(new Promise(() => {}));
    const { btw } = setup();
    btw.submit("s", turn, "t", "m", "Why?");

    expect(btw.submit("s", turn, "t", "m2", "And?")).toBe(false);
    expect(setup({ worktreeRemoved: true }).btw.submit("s", turn, "t", "m", "Why?")).toBe(false);
  });

  it("stops a running answer, keeping it ready for the next question", () => {
    harness.run.mockReturnValue(new Promise(() => {}));
    const { btw, thread } = setup();
    btw.submit("s", turn, "t", "m", "Why?");
    const { signal } = harness.run.mock.calls[0][0];

    btw.stop("s", turn, "t");

    expect(signal.aborted).toBe(true);
    expect(thread()?.status).toBe("ready");
  });

  it("retries only a failed thread", async () => {
    harness.run.mockResolvedValue("Answer");
    const { btw, thread, setThread } = setup();
    const failed: BtwThread = {
      id: "t",
      sourceEndBlockId: "reply",
      createdAt: 1,
      updatedAt: 1,
      status: "error",
      harness: "claude",
      error: "offline",
      messages: [{ id: "m", role: "user", text: "Why?", createdAt: 1 }],
    };
    setThread({ ...failed, status: "ready" });
    btw.retry("s", turn, "t");
    expect(harness.run).not.toHaveBeenCalled();

    setThread(failed);
    btw.retry("s", turn, "t");

    await vi.waitFor(() => expect(thread()?.status).toBe("ready"));
  });

  it("changes a thread's model and deletes a thread", () => {
    harness.run.mockReturnValue(new Promise(() => {}));
    const { btw, thread } = setup();
    btw.submit("s", turn, "t", "m", "Why?");
    const { signal } = harness.run.mock.calls[0][0];

    btw.changeModel("s", turn, "t", " sonnet ", { effort: "high" });
    expect(thread()).toMatchObject({ model: "sonnet", modelSettings: { effort: "high" } });

    btw.remove("s", turn, "t");
    expect(signal.aborted).toBe(true);
    expect(thread()).toBeUndefined();
  });
});
