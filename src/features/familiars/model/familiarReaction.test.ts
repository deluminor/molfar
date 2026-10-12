import { describe, expect, it } from "vitest";
import type { Block } from "../../sessions/model/session";
import {
  familiarReaction,
  familiarReactionBlocks,
  familiarReplyText,
} from "./familiarReaction";

const user = (id: string, extra: Partial<Block> = {}): Block => ({
  id,
  role: "user",
  text: id,
  ...extra,
});
const reply = (id: string, text: string, extra: Partial<Block> = {}): Block => ({
  id,
  role: "assistant",
  text,
  ...extra,
});

describe("Familiar reactions", () => {
  it("reads a reply that is only one emoji in the tag", () => {
    expect(familiarReaction("<reaction>👍</reaction>")).toBe("👍");
    expect(familiarReaction(" <reaction> 👍🏽 </reaction>\n")).toBe("👍🏽");
    expect(familiarReaction("<reaction>👍👍</reaction>")).toBeUndefined();
    expect(familiarReaction("<reaction>ok</reaction>")).toBeUndefined();
    expect(familiarReaction("Sure! <reaction>👍</reaction>")).toBeUndefined();
    expect(familiarReplyText("<reaction>🎉</reaction>")).toBe(
      "Reacted 🎉 to your message",
    );
    expect(familiarReplyText("Done.")).toBe("Done.");
  });

  it("moves the reaction onto the message it answers", () => {
    const blocks = [
      user("a"),
      reply("r1", "Here you go."),
      user("b"),
      reply("r2", "<reaction>👍</reaction>"),
    ];
    const shown = familiarReactionBlocks(blocks);
    expect(shown.map((block) => block.id)).toEqual(["a", "r1", "b"]);
    expect(shown[2]).toMatchObject({ id: "b", familiarReaction: "👍" });
    expect(shown[0]).toBe(blocks[0]);
    // The same input gives the same blocks, so turn caches hold.
    expect(familiarReactionBlocks(blocks)).toBe(shown);
    expect(familiarReactionBlocks([...blocks])[2]).toBe(shown[2]);
  });

  it("drops the work behind a reaction but keeps errors", () => {
    const shown = familiarReactionBlocks([
      user("a"),
      { id: "think", role: "reasoning", text: "They are wrapping up." },
      { id: "tool", role: "tool", text: "", tool: { title: "memory.add" } },
      { id: "err", role: "system", text: "Hook failed", notice: "error" },
      reply("r", "<reaction>👍</reaction>"),
    ]);
    expect(shown.map((block) => block.id)).toEqual(["a", "err"]);
    expect(shown[0].familiarReaction).toBe("👍");
  });

  it("leaves chats without reactions untouched", () => {
    const blocks = [user("a"), reply("r", "<reaction>hi</reaction>")];
    expect(familiarReactionBlocks(blocks)).toBe(blocks);
  });

  it("hides a reply while it may still become a reaction", () => {
    for (const text of ["<", "<react", "<reaction>", "<reaction>👍"])
      expect(
        familiarReactionBlocks([user("a"), reply("r", text, { streaming: true })]),
      ).toHaveLength(1);
    expect(
      familiarReactionBlocks([user("a"), reply("r", "Sure", { streaming: true })]),
    ).toHaveLength(2);
    // Once finished, a malformed tag is shown as written.
    expect(
      familiarReactionBlocks([user("a"), reply("r", "<reaction>👍")]),
    ).toHaveLength(2);
  });

  it("shows the emoji on its own when there is no message to sit on", () => {
    const shown = familiarReactionBlocks([
      user("report", { internal: true }),
      reply("r", "<reaction>🎉</reaction>"),
    ]);
    expect(shown[1]).toMatchObject({ role: "assistant", text: "🎉" });
  });
});
