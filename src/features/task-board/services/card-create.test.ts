import { beforeEach, describe, expect, it } from "vitest";
import { CardInputError, createCard, type NewCard } from "./card-create";
import { createFakePorts } from "./testing/fake-ports";

let fake: ReturnType<typeof createFakePorts>;

const input: NewCard = {
  projectCwd: "/code/app",
  title: "Add board",
  description: "Build it",
  acceptanceCriteria: "AC-1: It builds",
  baseRef: null,
};

const taskArtifacts = (cardId: string) => fake.board.artifacts.filter((entry) => entry.cardId === cardId && entry.kind === "task");

beforeEach(() => {
  fake = createFakePorts();
});

describe("createCard", () => {
  it("saves a backlog card with its task snapshot", async () => {
    const card = await createCard(fake.ports, input);

    expect(card).toMatchObject({ id: "id-1", columnId: "backlog", title: "Add board" });
    expect(taskArtifacts(card.id)).toHaveLength(1);
  });

  it("returns the card already saved under a caller-chosen id instead of a second one", async () => {
    const first = await createCard(fake.ports, { ...input, id: "app-s1-r1" });
    const retry = await createCard(fake.ports, { ...input, id: "app-s1-r1" });

    expect(retry.id).toBe(first.id);
    expect(fake.board.cards.size).toBe(1);
    expect(taskArtifacts(first.id)).toHaveLength(1);
  });

  it("writes the task snapshot a failed first attempt left out", async () => {
    await fake.ports.store.createCard({ ...input, id: "app-s1-r2" });

    const retry = await createCard(fake.ports, { ...input, id: "app-s1-r2" });

    expect(retry.id).toBe("app-s1-r2");
    expect(taskArtifacts("app-s1-r2")).toHaveLength(1);
  });

  it("hands back the card a concurrent retry inserted first", async () => {
    const original = fake.ports.store.createCard;
    fake.ports.store.createCard = async (card) => {
      await original(card);
      throw new Error("UNIQUE constraint failed: task_board_cards.id");
    };

    const card = await createCard(fake.ports, { ...input, id: "app-s1-r3" });

    expect(card.id).toBe("app-s1-r3");
    expect(taskArtifacts(card.id)).toHaveLength(1);
  });

  it("rejects projects that are not local git checkouts on the rail", async () => {
    await expect(createCard(fake.ports, { ...input, projectCwd: "/elsewhere" })).rejects.toBeInstanceOf(CardInputError);
    await expect(createCard(fake.ports, { ...input, projectCwd: "/not-git/app" })).rejects.toThrow("git project");
  });
});
