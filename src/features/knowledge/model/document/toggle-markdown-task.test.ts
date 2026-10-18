import { describe, expect, it } from "vitest";
import { toggleMarkdownTask } from "./toggle-markdown-task";

describe("toggleMarkdownTask", () => {
  it("checks and unchecks by document order", () => {
    const body = ["- [ ] one", "- [x] two", "* [ ] three"].join("\n");
    expect(toggleMarkdownTask(body, 0, true)).toBe(
      ["- [x] one", "- [x] two", "* [ ] three"].join("\n"),
    );
    expect(toggleMarkdownTask(body, 1, false)).toBe(
      ["- [ ] one", "- [ ] two", "* [ ] three"].join("\n"),
    );
    expect(toggleMarkdownTask(body, 2, true)).toBe(
      ["- [ ] one", "- [x] two", "* [x] three"].join("\n"),
    );
  });

  it("ignores fenced and indented code", () => {
    const body = [
      "- [ ] real",
      "```",
      "- [ ] fake",
      "```",
      "    - [ ] indented",
      "1. [ ] numbered",
    ].join("\n");
    expect(toggleMarkdownTask(body, 1, true)).toBe(
      [
        "- [ ] real",
        "```",
        "- [ ] fake",
        "```",
        "    - [ ] indented",
        "1. [x] numbered",
      ].join("\n"),
    );
  });

  it("returns null for out-of-range indexes", () => {
    expect(toggleMarkdownTask("- [ ] only", 1, true)).toBeNull();
    expect(toggleMarkdownTask("- [ ] only", -1, true)).toBeNull();
  });
});
