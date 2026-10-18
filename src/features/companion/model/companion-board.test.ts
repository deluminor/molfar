import { beforeEach, describe, expect, it } from "vitest";
import type { TaskBoardRuntime } from "@/features/task-board/hooks/use-task-board-engine";
import { runAction } from "@/features/task-board/services/actions";
import { createCard } from "@/features/task-board/services/card-create";
import { createFakePorts } from "@/features/task-board/services/testing/fake-ports";
import { createCompanionBoard, type BoardCardSummary } from "./companion-board";

let fake: ReturnType<typeof createFakePorts>;
let board: ReturnType<typeof createCompanionBoard>;

beforeEach(() => {
  fake = createFakePorts();
  const runtime: TaskBoardRuntime = {
    ports: fake.ports,
    create: (input) => createCard(fake.ports, input),
    act: (cardId, action) => runAction(fake.ports, cardId, action),
    needsInput: () => false,
  };
  board = createCompanionBoard(runtime, fake.ports.now);
});

const create = () =>
  board.handle("board.create", { project: "/code/app", title: "Board", description: "Build it" }) as Promise<BoardCardSummary>;

describe("companion board", () => {
  it("creates and lists cards with attention flags", async () => {
    const created = await create();
    const listed = (await board.handle("board.list", {})) as { cards: BoardCardSummary[] };

    expect(created).toMatchObject({ number: 1, column: "backlog", needsYou: false });
    expect(listed.cards.map((card) => card.id)).toEqual([created.id]);
    expect(await board.attention()).toBe(0);
  });

  it("moves a card like a drop and refuses stale or illegal moves", async () => {
    const card = await create();
    await expect(board.handle("board.move", { id: card.id, to: "done", ifUpdatedAt: card.updatedAt })).rejects.toThrow(/^illegal_transition:/);
    await expect(board.handle("board.move", { id: card.id, to: "grill", ifUpdatedAt: 1 })).rejects.toThrow(/^conflict:/);

    const moved = (await board.handle("board.move", { id: card.id, to: "grill", ifUpdatedAt: card.updatedAt })) as BoardCardSummary;
    expect(`${moved.column}/${moved.runState}`).toBe("grill/queued");
  });

  it("asks for board.action when a move needs input", async () => {
    const card = await create();
    const stored = fake.board.cards.get(card.id);
    if (stored) fake.board.cards.set(card.id, { ...stored, columnId: "final_review" });

    await expect(board.handle("board.move", { id: card.id, to: "done", ifUpdatedAt: card.updatedAt })).rejects.toThrow(
      /^needs_input: use board.action "deliver"/,
    );
    expect(await board.attention()).toBe(1);
  });

  it("refuses projects that are not on the rail", async () => {
    await expect(
      board.handle("board.create", { project: "/Users/me/secret-repo", title: "x", description: "y" }),
    ).rejects.toThrow("Choose one of the projects on the rail.");
  });

  it("validates action input", async () => {
    const card = await create();
    const base = { id: card.id, ifUpdatedAt: card.updatedAt };
    await expect(board.handle("board.action", { ...base, action: "launch" })).rejects.toThrow(/^invalid_input:/);
    await expect(board.handle("board.action", { ...base, action: "deliver", method: "ftp" })).rejects.toThrow(/^invalid_input:/);
    await expect(board.handle("board.action", { ...base, action: "retry", runtimeMode: "root" })).rejects.toThrow(/^invalid_input:/);
    await expect(board.handle("board.card", { id: "../x" })).rejects.toThrow(/^invalid_input:/);
  });

  it("returns card detail with the latest artifact bodies and legal moves", async () => {
    const card = await create();
    const detail = (await board.handle("board.card", { id: card.id })) as {
      legalMoves: string[];
      artifacts: { kind: string; body?: string }[];
    };

    expect(detail.legalMoves).toEqual(["grill"]);
    expect(detail.artifacts[0]).toMatchObject({ kind: "task" });
    expect(detail.artifacts[0].body).toContain("Build it");
  });

  it("reaches a stage session only through its own card", async () => {
    const first = await create();
    const second = await create();
    const run = await fake.ports.store.createRun({
      id: "run-1",
      cardId: first.id,
      stage: "grill",
      harness: "claude",
      model: "claude:opus",
      settingsJson: "{}",
      runtimeMode: "auto",
      templateVersion: 1,
    });
    await fake.ports.store.updateRun(run.id, { sessionId: "session-9" });

    expect(await board.stageSession({ id: first.id, runId: run.id })).toBe("session-9");
    await expect(board.stageSession({ id: second.id, runId: run.id })).rejects.toThrow(/^not_found:/);
  });
});
