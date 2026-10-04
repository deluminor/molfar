import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/session/block";
import {
  foldableWork,
  foldedBlocks,
  groupTurnItems,
  workSummaryLine,
} from "./transcript-activity";

// Blocks the Claude harness produces for a background command; the harness
// side is pinned in claude-live.test.ts ("claude background tasks").
const waiting: Block = {
  id: "waiting",
  role: "assistant",
  text: "waiting",
  streaming: false,
};

function backgroundCommand(status: "in_progress" | "completed"): Block {
  return {
    id: "background",
    role: "tool",
    text: "sleep 30 && echo done",
    streaming: status === "in_progress",
    tool: {
      callId: "background:b1",
      title: "sleep 30 && echo done",
      kind: "execute",
      status,
      ...(status === "completed"
        ? {
            detail:
              'Background command "sleep 30 && echo done" completed (exit code 0)',
          }
        : {}),
      background: true,
    },
  };
}

describe("background commands in a turn", () => {
  it("keeps the message Claude yielded with out of the folded work", () => {
    const followUp: Block = {
      id: "follow-up",
      role: "assistant",
      text: "It finished and printed done.",
      streaming: false,
    };
    const items = groupTurnItems(
      [waiting, backgroundCommand("completed"), followUp],
      { settled: true },
    );
    const fold = foldableWork(items);

    const answer = items.at(-1);
    expect(answer?.type === "block" && answer.block.text).toBe(
      "It finished and printed done.",
    );
    expect(
      (fold ? foldedBlocks(items, fold) : []).map((block) => block.text),
    ).not.toContain("waiting");
  });

  it("shows the waited-on command as a live row", () => {
    const items = groupTurnItems([waiting, backgroundCommand("in_progress")]);

    const group = items.at(-1);
    expect(
      group?.type === "activity" && workSummaryLine(group.blocks, true),
    ).toBe("Running in background");
  });
});
