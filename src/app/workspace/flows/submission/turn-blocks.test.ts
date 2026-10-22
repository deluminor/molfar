import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/session/block";
import { testSession } from "@/integrations/harness/core/test-session";
import { lastAssistantTextInTurn, userTurnCards, withPlanStatus } from "./turn-blocks";

const session = (blocks: Block[], patch = {}) => ({
  ...testSession("claude", "/work/demo"),
  blocks,
  ...patch,
});

describe("turn blocks", () => {
  it("reads the last reply of the latest turn", () => {
    const blocks: Block[] = [
      { id: "u1", role: "user", text: "first" },
      { id: "a1", role: "assistant", text: "old" },
      { id: "u2", role: "user", text: "second" },
      { id: "a2", role: "assistant", text: "new" },
      { id: "a3", role: "assistant", text: "  " },
    ];

    expect(lastAssistantTextInTurn(session(blocks))).toBe("new");
    expect(lastAssistantTextInTurn(session(blocks.slice(0, 3)))).toBe("");
  });

  it("skips a Familiar's queued user bubbles", () => {
    const blocks: Block[] = [
      { id: "a1", role: "assistant", text: "reply" },
      { id: "q", role: "user", text: "waiting" },
    ];

    const familiar = session(blocks, {
      queuedMessages: [{ id: "m", blockId: "q", text: "waiting", attachments: [] }],
    });

    expect(lastAssistantTextInTurn(familiar)).toBe("reply");
  });

  it("sets the status of one plan block only", () => {
    const blocks: Block[] = [
      { id: "p", role: "plan", text: "plan", plan: { status: "building" } },
      { id: "x", role: "assistant", text: "other" },
    ];

    const next = withPlanStatus(session(blocks), "p", "built");

    expect(next.blocks[0].plan?.status).toBe("built");
    expect(next.blocks[1]).toBe(blocks[1]);
  });

  it("adds no cards to a plain turn", () => {
    expect(userTurnCards(undefined)).toBeUndefined();
  });
});
