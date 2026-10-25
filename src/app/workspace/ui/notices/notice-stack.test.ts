import { describe, expect, it } from "vitest";
import { noticeStackOffset } from "./notice-stack";

describe("noticeStackOffset", () => {
  it("starts at the top margin with nothing above", () => {
    expect(noticeStackOffset([])).toBe(12);
  });

  it("skips hidden notices and adds a gap after each shown one", () => {
    expect(noticeStackOffset([40, 0, 30])).toBe(12 + 48 + 38);
  });
});
