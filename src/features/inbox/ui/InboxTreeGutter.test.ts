import { describe, expect, it } from "vitest";
import {
  INBOX_TREE_INDENT_BASE_PX,
  INBOX_TREE_INDENT_STEP_PX,
  inboxTreeIndentPx,
} from "./InboxTreeGutter";

describe("inboxTreeIndentPx", () => {
  it("uses base padding at the root", () => {
    expect(inboxTreeIndentPx(0)).toBe(INBOX_TREE_INDENT_BASE_PX);
  });

  it("steps ~16px per nesting level", () => {
    expect(INBOX_TREE_INDENT_STEP_PX).toBe(16);
    expect(inboxTreeIndentPx(1)).toBe(INBOX_TREE_INDENT_BASE_PX + 16);
    expect(inboxTreeIndentPx(2)).toBe(INBOX_TREE_INDENT_BASE_PX + 32);
  });
});
