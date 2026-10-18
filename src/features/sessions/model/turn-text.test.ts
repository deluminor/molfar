import type { Block } from "@/domain/session/block";
import { describe, expect, it } from "vitest";
import { lastTurnAssistantText } from "./turn-text";

const block = (id: string, role: Block["role"], text: string, extra: Partial<Block> = {}): Block => ({
  id,
  role,
  text,
  ...extra,
});

describe("lastTurnAssistantText", () => {
  it("joins every assistant message after the latest submitted user turn", () => {
    const blocks = [
      block("1", "user", "first"),
      block("2", "assistant", "old answer"),
      block("3", "user", "second"),
      block("4", "assistant", "part one"),
      block("5", "tool", "ran tests"),
      block("6", "assistant", "part two"),
    ];

    expect(lastTurnAssistantText(blocks)).toBe("part one\npart two");
  });

  it("ignores an unsent draft and keeps long text whole", () => {
    const long = "x".repeat(50_000);
    const blocks = [
      block("1", "user", "go"),
      block("2", "assistant", long),
      block("3", "user", "later", { draft: true }),
    ];

    expect(lastTurnAssistantText(blocks)).toHaveLength(50_000);
  });

  it("returns an empty string when the turn produced no text", () => {
    expect(lastTurnAssistantText([block("1", "user", "go")])).toBe("");
  });
});
