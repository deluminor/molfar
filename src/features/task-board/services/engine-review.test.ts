import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../sessions/model/launch-choice", () => ({
  resolveLaunchChoice: (_cwd: string, input: Record<string, unknown>) => ({
    harness: input.harness ?? "claude",
    model: input.model ?? "claude:opus",
    modelSettings: {},
    runtimeMode: input.runtimeMode ?? "auto",
  }),
}));

import { runAction, type OwnerAction } from "./actions";
import { createCard } from "./card-create";
import { TaskBoardEngine } from "./engine";
import { block, createFakePorts } from "./testing/fake-ports";

const flush = async () => {
  for (let index = 0; index < 5; index++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const GRILL = [block("spec", "# Spec"), block("plan", "# Plan")].join("\n");
const IMPL = block("impl_report", "# Report");
const REVIEW = block("review", "Verdict: APPROVE");

let fake: ReturnType<typeof createFakePorts>;
let engine: TaskBoardEngine;

const state = (id: string) => {
  const card = fake.board.cards.get(id);
  return `${card?.columnId}/${card?.runState}`;
};
const runs = () => [...fake.board.runs.values()];
const last = () => fake.sessions.launched[fake.sessions.launched.length - 1];

async function act(id: string, action: OwnerAction) {
  const card = await runAction(fake.ports, id, action);
  await engine.tick();
  await flush();
  return card;
}

async function finish(text: string, commit = false) {
  if (commit) fake.git.commit(last().launch.cwd);
  last().settle({ status: "completed", text });
  await flush();
  await engine.tick();
  await flush();
}

async function newCard() {
  return createCard(fake.ports, { projectCwd: "/code/app", title: "Board", description: "Build it", acceptanceCriteria: "", baseRef: null });
}

async function reviewed() {
  const { id } = await newCard();
  await act(id, { type: "start" });
  await finish(GRILL);
  await act(id, { type: "approvePlan" });
  await finish(IMPL, true);
  await finish(REVIEW);
  return id;
}

beforeEach(() => {
  fake = createFakePorts();
  engine = new TaskBoardEngine(fake.ports);
});

describe("stage lifecycle races", () => {
  it("never launches an agent for a stage cancelled while it was starting", async () => {
    const { id } = await newCard();
    let release = () => undefined as void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const create = fake.ports.git.createWorktree;
    fake.ports.git.createWorktree = async (...args) => {
      await gate;
      return create(...args);
    };

    await runAction(fake.ports, id, { type: "start" });
    void engine.tick();
    await flush();
    await runAction(fake.ports, id, { type: "cancel" });
    release();
    await flush();

    expect(fake.sessions.launched).toHaveLength(0);
    expect(state(id)).toBe("grill/failed");
    expect(runs()[0].status).toBe("cancelled");
  });

  it("ignores a late settlement from a cancelled run once a retry is running", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    const first = last();
    await act(id, { type: "cancel" });
    await act(id, { type: "retry" });

    first.settle({ status: "cancelled", text: "" });
    await flush();
    await engine.tick();
    await flush();

    expect(state(id)).toBe("grill/running");
    expect(runs().map((run) => run.status)).toEqual(["cancelled", "running"]);
    await finish(GRILL);
    expect(state(id)).toBe("plan_approval/idle");
  });

  it("reuses a worktree left behind by an interrupted start", async () => {
    const { id } = await newCard();
    const snapshot = fake.ports.git.snapshot;
    let failures = 1;
    fake.ports.git.snapshot = async (cwd) => {
      if (cwd.startsWith("/worktrees/") && failures-- > 0) throw new Error("crash after worktree add");
      return snapshot(cwd);
    };

    await act(id, { type: "start" });
    expect(state(id)).toBe("grill/failed");
    await act(id, { type: "retry" });

    expect(state(id)).toBe("grill/running");
    expect(fake.git.calls.filter((call) => call.startsWith("worktree "))).toHaveLength(1);
  });

  it("keeps an oversized error within what storage accepts", async () => {
    const { id } = await newCard();
    fake.ports.git.createWorktree = async () => {
      throw new Error("x".repeat(30_000));
    };
    await act(id, { type: "start" });

    expect(state(id)).toBe("grill/failed");
    expect(fake.board.cards.get(id)?.lastError?.length).toBeLessThan(20_000);
  });
});

describe("delivery and owner actions", () => {
  it("lets only one of two simultaneous deliveries run", async () => {
    const id = await reviewed();
    const results = await Promise.allSettled([
      runAction(fake.ports, id, { type: "deliver", method: "pr" }),
      runAction(fake.ports, id, { type: "deliver", method: "pr" }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(fake.git.calls.filter((call) => call.startsWith("pr "))).toHaveLength(1);
    expect(state(id)).toBe("done/idle");
  });

  it("resumes a failed squash-merge without opening a second pull request", async () => {
    const id = await reviewed();
    const merge = fake.ports.git.squashMerge;
    fake.ports.git.squashMerge = async () => {
      throw new Error("checks pending");
    };
    const failed = await runAction(fake.ports, id, { type: "deliver", method: "merge" });
    expect(`${failed.columnId}/${failed.runState}`).toBe("final_review/failed");

    fake.ports.git.squashMerge = merge;
    const done = await runAction(fake.ports, id, { type: "deliver", method: "merge" });

    expect(done.columnId).toBe("done");
    expect(fake.git.calls.filter((call) => call.startsWith("pr "))).toHaveLength(1);
    expect(fake.git.calls).toContain("merge acme/app#42");
  });

  it("finishes delivery even when the worktree cannot be removed", async () => {
    const id = await reviewed();
    fake.ports.git.removeWorktree = async () => {
      throw new Error("terminal still open");
    };
    const done = await runAction(fake.ports, id, { type: "deliver", method: "pr" });

    expect(done.columnId).toBe("done");
    expect(done.lastError).toMatch(/could not be removed/);
    expect(done.worktreePath).not.toBeNull();
  });

  it("refuses an answer outside the plan gate without writing it", async () => {
    const { id } = await newCard();
    await expect(runAction(fake.ports, id, { type: "answer", answers: [], note: "x" })).rejects.toThrow(/Cannot answer/);
    expect(fake.board.latest(id, "answers")).toBeUndefined();
  });

  it("archives a rejected card even when its worktree cannot be removed", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await finish("nothing");
    fake.ports.git.removeWorktree = async () => {
      throw new Error("busy");
    };
    const card = await runAction(fake.ports, id, { type: "reject" });

    expect(card.archived).toBe(true);
    expect(card.lastError).toMatch(/could not be removed/);
  });

  it("fails a read-only stage that edited an already dirty file", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await finish(GRILL);
    fake.git.dirty(fake.board.cards.get(id)?.worktreePath ?? "");
    await act(id, { type: "requestChanges", note: "again" });
    fake.git.dirty(last().launch.cwd);
    await finish(GRILL);

    expect(fake.board.cards.get(id)?.lastError).toMatch(/wrote to the checkout/);
  });
});
