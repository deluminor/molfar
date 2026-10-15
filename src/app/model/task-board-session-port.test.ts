import { describe, expect, it, vi } from "vitest";
import type { ControlOutcome } from "../../features/orchestration/model/orchestration";
import type { Session } from "../../features/sessions/model/session";
import type { StageLaunch } from "../../features/task-board/services/ports";
import { createTaskBoardSessionPort, type TaskBoardSessionDeps } from "./task-board-session-port";

const stage: StageLaunch = {
  sessionId: "s1",
  cardId: "card-1",
  stage: "grill",
  cwd: "/worktrees/task",
  projectCwd: "/code/app",
  title: "#1 Board",
  choice: { harness: "claude", model: "claude:opus", modelSettings: { effort: "high" }, runtimeMode: "auto" },
};

const session = (busy: boolean, text: string): Session =>
  ({
    id: "s1",
    busy,
    blocks: [
      { id: "u", role: "user", text: "go" },
      { id: "a", role: "assistant", text },
    ],
  }) as unknown as Session;

function setup(overrides: Partial<TaskBoardSessionDeps> = {}) {
  let live: Session[] = [];
  let onSettled: ((outcome: ControlOutcome) => void) | undefined;
  const deps: TaskBoardSessionDeps = {
    launch: vi.fn(async (_launch, _id, settle) => {
      onSettled = settle;
    }),
    sessions: () => live,
    loadSession: vi.fn(async () => session(false, "from disk")),
    stop: vi.fn(async () => undefined),
    wait: async () => undefined,
    ...overrides,
  };
  return {
    port: createTaskBoardSessionPort(deps),
    deps,
    setLive: (next: Session[]) => {
      live = next;
    },
    settle: (outcome: ControlOutcome) => onSettled?.(outcome),
  };
}

describe("task board session port", () => {
  it("launches a titled, card-linked session in the card's worktree", async () => {
    const { port, deps } = setup();
    await port.launch(stage, "prompt", () => undefined);

    expect(deps.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskCardId: "card-1",
        title: "#1 Board",
        cwd: "/code/app",
        worktreeCwd: "/worktrees/task",
        harness: "claude",
        modelSettings: { effort: "high" },
        reveal: false,
      }),
      "s1",
      expect.any(Function),
    );
  });

  it("settles with the full turn text from the live session once it is idle", async () => {
    const { port, setLive, settle } = setup();
    const outcomes: ControlOutcome[] = [];
    await port.launch(stage, "prompt", (outcome) => outcomes.push(outcome));
    setLive([session(false, "x".repeat(30_000))]);

    settle({ status: "completed", text: "capped tail" });
    await vi.waitFor(() => expect(outcomes).toHaveLength(1));

    expect(outcomes[0].text).toHaveLength(30_000);
  });

  it("falls back to the stored transcript after the session was detached", async () => {
    const { port, settle } = setup();
    const outcomes: ControlOutcome[] = [];
    await port.launch(stage, "prompt", (outcome) => outcomes.push(outcome));

    settle({ status: "completed", text: "" });
    await vi.waitFor(() => expect(outcomes).toHaveLength(1));

    expect(outcomes[0].text).toBe("from disk");
  });

  it("reports a rejected submission only through settlement", async () => {
    const { port, deps } = setup({
      launch: vi.fn(async (_launch, _id, settle) => {
        settle({ status: "failed", text: "", error: "rejected" });
        throw new Error("The workspace could not accept the queued session yet.");
      }),
    });

    await expect(port.launch(stage, "prompt", () => undefined)).resolves.toBeUndefined();
    expect(deps.launch).toHaveBeenCalledOnce();
  });

  it("rethrows when no session could be created", async () => {
    const { port } = setup({ launch: vi.fn(async () => Promise.reject(new Error("no pane"))) });
    await expect(port.launch(stage, "prompt", () => undefined)).rejects.toThrow("no pane");
  });

  it("reports session state", async () => {
    const { port, setLive } = setup();
    expect(port.state("s1")).toBe("missing");
    setLive([session(true, "")]);
    expect(port.state("s1")).toBe("busy");
  });
});
