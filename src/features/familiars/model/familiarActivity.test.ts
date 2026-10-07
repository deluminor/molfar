import { expect, it } from "vitest";
import type { Block } from "../../sessions/model/session";
import {
  resolveFamiliarActivity,
  type FamiliarActivitySelection,
} from "./familiarActivity";

const blocks: Block[] = [
  { id: "user", role: "user", text: "Inspect" },
  {
    id: "call",
    role: "tool",
    text: "Inspect file",
    tool: { status: "in_progress" },
  },
];
const selection: FamiliarActivitySelection = {
  sessionId: "familiar",
  turnId: "user",
  blocks,
};

it("follows the selected live turn, including new steps and settled tool state", () => {
  const updated: Block[] = [
    blocks[0],
    { ...blocks[1], tool: { status: "completed" } },
    { id: "reply", role: "assistant", text: "Done" },
  ];
  expect(
    resolveFamiliarActivity(selection, { id: "familiar", blocks: updated, busy: true }),
  ).toEqual({
    turnId: "user",
    blocks: updated,
    live: true,
  });
  expect(
    resolveFamiliarActivity(selection, { id: "familiar", blocks: updated, busy: false })
      ?.live,
  ).toBe(false);
  expect(
    resolveFamiliarActivity(selection, {
      id: "familiar",
      blocks: [
        ...updated,
        { id: "next", role: "user", text: "Another request" },
      ],
      busy: true,
    })?.live,
  ).toBe(false);
});

it("retains an archived turn without borrowing another turn or Familiar's activity", () => {
  expect(
    resolveFamiliarActivity(selection, {
      id: "familiar",
      blocks: [{ id: "new", role: "user", text: "Latest" }],
      busy: true,
    }),
  ).toEqual({
    turnId: "user",
    blocks,
    live: false,
  });
  expect(
    resolveFamiliarActivity(selection, { id: "another-familiar", blocks }),
  ).toBeNull();
  expect(resolveFamiliarActivity(selection, undefined)).toBeNull();
  expect(resolveFamiliarActivity(null, { id: "familiar", blocks })).toBeNull();
});

it("keeps completion activity separate from the previous reply before any output arrives", () => {
  const notification: Block = {
    id: "notification",
    role: "user",
    text: "Hidden completion prompt",
    internal: true,
    startedAt: 2_000,
    familiarSessionCompletion: {
      sessionId: "worker",
      title: "Review",
      status: "completed",
    },
  };
  const session = { id: "familiar", blocks: [...blocks, notification], busy: true };
  expect(resolveFamiliarActivity(selection, session)?.live).toBe(false);
  const completionSelection = {
    sessionId: "familiar",
    turnId: notification.id,
    blocks: [notification],
  };
  const step: Block = {
    id: "check-report",
    role: "tool",
    text: "Read the review session",
    tool: { status: "in_progress" },
  };
  const updated = { ...session, blocks: [...session.blocks, step] };
  expect(resolveFamiliarActivity(completionSelection, updated)).toEqual({
    turnId: notification.id,
    blocks: [notification, step],
    live: true,
  });
});
