import { describe, expect, it } from "vitest";
import { mapUsageWindow, parseResetTimestamp } from "./usage-window";

describe("parseResetTimestamp", () => {
  it("treats small numbers as unix seconds", () => {
    expect(parseResetTimestamp(1_738_425_600)).toBe(1_738_425_600_000);
  });

  it("keeps millisecond epochs", () => {
    expect(parseResetTimestamp(1_738_425_600_000)).toBe(1_738_425_600_000);
  });

  it("parses ISO strings", () => {
    expect(parseResetTimestamp("2026-08-27T12:00:00.000Z")).toBe(
      Date.parse("2026-08-27T12:00:00.000Z"),
    );
  });
});

describe("mapUsageWindow", () => {
  it("accepts camelCase Codex-shaped windows", () => {
    expect(
      mapUsageWindow({ usedPercent: 12, resetsAt: 1_738_425_600 }, 300),
    ).toEqual({
      usedPercent: 12,
      windowMinutes: 300,
      resetsAt: 1_738_425_600_000,
    });
  });
});
