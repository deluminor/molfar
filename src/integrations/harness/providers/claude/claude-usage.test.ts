import { describe, expect, it } from "vitest";
import { parseClaudeOAuthUsage } from "./claude-usage";

describe("parseClaudeOAuthUsage", () => {
  it("maps five_hour and seven_day windows", () => {
    const limits = parseClaudeOAuthUsage(
      JSON.stringify({
        five_hour: { used_percentage: 58.2, resets_at: 1_738_425_600 },
        seven_day: { utilization: 41, resets_at: "2026-09-01T00:00:00.000Z" },
      }),
    );
    expect(limits.status).toBe("ok");
    expect(limits.session).toEqual({
      usedPercent: 58.2,
      windowMinutes: 300,
      resetsAt: 1_738_425_600_000,
    });
    expect(limits.weekly?.usedPercent).toBe(41);
    expect(limits.weekly?.windowMinutes).toBe(10_080);
    expect(limits.weekly?.resetsAt).toBe(
      Date.parse("2026-09-01T00:00:00.000Z"),
    );
  });

  it("returns an error for garbage", () => {
    const limits = parseClaudeOAuthUsage("not json");
    expect(limits.status).toBe("error");
    expect(limits.session).toBeNull();
  });
});
