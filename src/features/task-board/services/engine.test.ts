import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../sessions/model/launch-choice", () => ({
  resolveLaunchChoice: (_cwd: string, input: Record<string, unknown>) => ({
    harness: input.harness ?? "claude",
    model: input.model ?? "claude:opus",
    modelSettings: {},
    runtimeMode: input.runtimeMode ?? "auto",
  }),
}));

import { runAction } from "./actions";
import { createCard } from "./card-create";
import { TaskBoardEngine } from "./engine";
import { block, createFakePorts } from "./testing/fake-ports";

const flush = async () => {
  for (let index = 0; index < 5; index++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const GRILL_OUTPUT = [
  block("spec", '---\npr_title: "feat(board): add the board"\n---\n# Spec'),
  block("plan", "# Plan"),
  block("questions", "## Q1 — Storage\nWhere?\n**Recommended:** App data."),
].join("\n");
const IMPL_OUTPUT = block("impl_report", "# Implementation report\nDone.");
const REVIEW_OUTPUT = block("review", "Verdict: CHANGES_REQUESTED\n\n## F1 [major] Missing test\nFile: a.ts:1\nAdd one.");

let fake: ReturnType<typeof createFakePorts>;
let engine: TaskBoardEngine;

const lastLaunch = () => fake.sessions.launched[fake.sessions.launched.length - 1];
const cardState = (id: string) => {
  const card = fake.board.cards.get(id);
  return card ? `${card.columnId}/${card.runState}` : "missing";
};

async function newCard(title = "Add board", projectCwd = "/code/app") {
  return createCard(fake.ports, { projectCwd, title, description: "Build it", acceptanceCriteria: "", baseRef: null });
}

async function act(id: string, action: Parameters<typeof runAction>[2]) {
  const card = await runAction(fake.ports, id, action);
  await engine.tick();
  await flush();
  return card;
}

async function finish(text: string, change?: "commit" | "dirty") {
  const launched = lastLaunch();
  if (change === "commit") fake.git.commit(launched.launch.cwd);
  if (change === "dirty") fake.git.dirty(launched.launch.cwd);
  launched.settle({ status: "completed", text });
  await flush();
  await engine.tick();
  await flush();
}

beforeEach(() => {
  fake = createFakePorts();
  engine = new TaskBoardEngine(fake.ports);
});

describe("TaskBoardEngine pipeline", () => {
  it("runs a card from backlog to an opened pull request", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });

    expect(cardState(id)).toBe("grill/running");
    expect(lastLaunch().launch.cwd).toMatch(/^\/worktrees\/molfar\/task-/);
    expect(lastLaunch().prompt).toContain("READ-ONLY stage");

    await finish(GRILL_OUTPUT);
    expect(cardState(id)).toBe("plan_approval/idle");
    expect(fake.notices.at(-1)?.kind).toBe("gate");

    await act(id, { type: "answer", answers: [{ number: 1, answer: "Keep it in app data" }], note: "" });
    expect(fake.sessions.launched).toHaveLength(2);
    expect(fake.board.handoffText(id)).toContain("Keep it in app data");
    expect(lastLaunch().prompt).toContain(".molfar/board/answers-v1.md");
    expect(lastLaunch().prompt).not.toContain("Keep it in app data");
    expect(lastLaunch().prompt).toContain("Grill round 2");

    await finish(GRILL_OUTPUT);
    await act(id, { type: "approvePlan" });
    expect(cardState(id)).toBe("implement/running");

    await finish(IMPL_OUTPUT, "commit");
    expect(cardState(id)).toBe("code_review/running");
    expect(fake.board.handoffText(id)).toContain("Done.");
    expect(lastLaunch().prompt).toContain(".molfar/board/impl_report-v1.md");

    await finish(REVIEW_OUTPUT);
    expect(cardState(id)).toBe("final_review/idle");

    await act(id, { type: "rework", findings: ["F1"], note: "Cover the edge case" });
    expect(cardState(id)).toBe("rework/running");
    expect(fake.board.handoffText(id)).toContain("Cover the edge case");
    expect(fake.board.cards.get(id)?.reworkCycle).toBe(1);

    await finish(IMPL_OUTPUT, "commit");
    await finish(REVIEW_OUTPUT);
    const done = await act(id, { type: "deliver", method: "pr" });

    expect(done.columnId).toBe("done");
    expect(JSON.parse(done.deliveryJson ?? "{}").prUrl).toBe("https://github.com/acme/app/pull/42");
    const pr = fake.git.calls.find((call) => call.startsWith("pr "));
    expect(pr).toContain("feat(board): add the board → main");
    expect(pr).not.toMatch(/co-authored|generated with|erik/i);
    expect(fake.git.calls.some((call) => call.startsWith("remove "))).toBe(true);
    expect(fake.board.latest(id, "delivery")).toBeDefined();
  });

  it("fails a read-only stage that touched the checkout", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await finish(GRILL_OUTPUT, "dirty");

    expect(cardState(id)).toBe("grill/failed");
    expect(fake.board.cards.get(id)?.lastError).toMatch(/wrote to the checkout/);
    expect(fake.notices.at(-1)?.kind).toBe("failed");
  });

  it("fails a stage that returned no artifacts", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await finish("I looked around.");

    expect(fake.board.cards.get(id)?.lastError).toBe("The stage did not return: spec, plan.");
  });

  it("requires implement to commit and to leave a clean tree", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await finish(GRILL_OUTPUT);
    await act(id, { type: "approvePlan" });
    await finish(IMPL_OUTPUT);
    expect(fake.board.cards.get(id)?.lastError).toBe("The stage made no new commit.");

    await act(id, { type: "retry" });
    await finish(IMPL_OUTPUT, "dirty");
    expect(fake.board.cards.get(id)?.lastError).toMatch(/uncommitted changes/);

    await act(id, { type: "retry" });
    expect(cardState(id)).toBe("implement/failed");
    expect(fake.board.cards.get(id)?.lastError).toMatch(/has uncommitted changes/);
  });

  it("starts at most the configured number of stages and drains the queue FIFO", async () => {
    const cards = [];
    for (const title of ["a", "b", "c", "d"]) cards.push(await newCard(title));
    for (const card of cards) await act(card.id, { type: "start" });

    expect(fake.sessions.launched).toHaveLength(3);
    expect(cardState(cards[3].id)).toBe("grill/queued");

    fake.sessions.launched[0].settle({ status: "completed", text: GRILL_OUTPUT });
    await flush();
    await flush();

    expect(fake.sessions.launched).toHaveLength(4);
    expect(cardState(cards[3].id)).toBe("grill/running");
  });

  it("cancels a running stage and keeps the card failed after the session stops", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await act(id, { type: "cancel" });
    lastLaunch().settle({ status: "cancelled", text: "" });
    await flush();

    expect(fake.sessions.stopped).toEqual([lastLaunch().sessionId]);
    expect(cardState(id)).toBe("grill/failed");
    expect(fake.board.cards.get(id)?.lastError).toBe("Cancelled.");
    expect([...fake.board.runs.values()][0].status).toBe("cancelled");
  });

  it("retries with a model override that sticks to the card", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await finish("nothing");
    await act(id, { type: "retry", override: { harness: "codex", model: "codex:gpt" } });

    const runs = [...fake.board.runs.values()];
    expect(runs.map((run) => `${run.attempt}:${run.harness}`)).toEqual(["1:claude", "2:codex"]);
    expect(JSON.parse(fake.board.cards.get(id)?.overridesJson ?? "{}").grill.model).toBe("codex:gpt");
  });
});

describe("recovery and attention", () => {
  it("marks runs whose session vanished as interrupted after a restart", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    fake.sessions.states.clear();

    const restarted = new TaskBoardEngine(fake.ports);
    await restarted.tick();

    expect(cardState(id)).toBe("grill/failed");
    expect(fake.board.cards.get(id)?.lastError).toMatch(/MOLFAR stopped/);
    expect([...fake.board.runs.values()][0].status).toBe("interrupted");
  });

  it("fails a card that was claimed but never got a stage run", async () => {
    const { id } = await newCard();
    await runAction(fake.ports, id, { type: "start" });
    await fake.ports.store.claimNext();

    await new TaskBoardEngine(fake.ports).tick();

    expect(cardState(id)).toBe("grill/failed");
    expect(fake.board.cards.get(id)?.lastError).toMatch(/before it started/);
  });

  it("notifies once when a stage runs past the stall time", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    fake.advance(46 * 60_000);
    await engine.tick();
    await engine.tick();

    expect(fake.notices.filter((notice) => notice.kind === "stalled")).toHaveLength(1);
    expect(cardState(id)).toBe("grill/running");
  });
});

describe("delivery and rejection", () => {
  async function reviewed() {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await finish(GRILL_OUTPUT);
    await act(id, { type: "approvePlan" });
    await finish(IMPL_OUTPUT, "commit");
    await finish(REVIEW_OUTPUT);
    return id;
  }

  it("squash-merges through a pull request", async () => {
    const id = await reviewed();
    await act(id, { type: "deliver", method: "merge" });

    expect(cardState(id)).toBe("done/idle");
    expect(fake.git.calls).toContain("merge acme/app#42");
  });

  it("keeps the branch without pushing", async () => {
    const id = await reviewed();
    await act(id, { type: "deliver", method: "keep" });

    expect(cardState(id)).toBe("done/idle");
    expect(fake.git.calls.some((call) => call.startsWith("push"))).toBe(false);
  });

  it("refuses a dirty worktree and stays in final review", async () => {
    const id = await reviewed();
    fake.git.dirty(fake.board.cards.get(id)?.worktreePath ?? "");
    const card = await act(id, { type: "deliver", method: "pr" });

    expect(`${card.columnId}/${card.runState}`).toBe("final_review/failed");
    expect(card.lastError).toMatch(/uncommitted changes/);
  });

  it("archives a rejected card and drops its unpushed branch", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await finish("nothing");
    const card = await act(id, { type: "reject" });

    expect(card.archived).toBe(true);
    expect(fake.git.calls.some((call) => call.endsWith("--force"))).toBe(true);
    expect(fake.git.calls.some((call) => call.startsWith("delete-branch molfar/task-"))).toBe(true);
  });

  it("refuses non-git and remote projects", async () => {
    await expect(newCard("x", "/not-git/app")).rejects.toThrow(/git project/);
    await expect(newCard("x", "remote://host/app")).rejects.toThrow(/local projects/);
  });

  it("writes a note-only answer when the plan needs changes", async () => {
    const { id } = await newCard();
    await act(id, { type: "start" });
    await finish([block("spec", "S"), block("plan", "P")].join("\n"));
    await act(id, { type: "requestChanges", note: "Split stage 3" });

    expect(fake.board.latest(id, "answers")?.body).toBe("## Note\n\nSplit stage 3");
    expect(fake.board.handoffText(id)).toContain("Split stage 3");
  });
});
