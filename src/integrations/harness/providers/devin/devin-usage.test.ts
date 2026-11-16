import { describe, expect, it } from "vitest";
import { parseDevinUsage } from "./devin-usage";

describe("parseDevinUsage", () => {
  it("turns remaining daily and weekly quota into used windows", () => {
    const limits = parseDevinUsage({
      plan: "Pro",
      dailyRemainingPercent: 0,
      dailyResetsAt: 1_791_273_600,
      weeklyRemainingPercent: 42,
      weeklyResetsAt: 1_791_705_600,
      extraUsageBalanceMicros: -1_673_099,
    });
    expect(limits.extraUsageBalance).toBeCloseTo(-1.673099);
    expect(limits).toMatchObject({
      provider: "devin",
      status: "ok",
      session: { usedPercent: 100, windowMinutes: 1_440, resetsAt: 1_791_273_600_000 },
      weekly: { usedPercent: 58, windowMinutes: 10_080, resetsAt: 1_791_705_600_000 },
      monthly: null,
    });
  });

  it("leaves out windows the plan hides", () => {
    const limits = parseDevinUsage({ weeklyRemainingPercent: 80, weeklyResetsAt: null });
    expect(limits.session).toBeNull();
    expect(limits.weekly).toEqual({ usedPercent: 20, windowMinutes: 10_080, resetsAt: null });
    expect(limits.extraUsageBalance).toBeNull();
  });
});
