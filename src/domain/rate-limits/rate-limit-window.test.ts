import { describe, expect, it } from "vitest";
import { exhaustedWindowResetAt } from "./rate-limit-window";
import { idleRateLimits } from "./rate-limit-state";

describe("exhaustedWindowResetAt", () => {
  it("returns the latest reset among spent windows", () => {
    const limits = {
      ...idleRateLimits("codex"),
      session: { usedPercent: 100, windowMinutes: 300, resetsAt: 2_000 },
      weekly: { usedPercent: 100, windowMinutes: 10_080, resetsAt: 9_000 },
    };
    expect(exhaustedWindowResetAt(limits)).toBe(9_000);
  });

  it("ignores windows with room left", () => {
    const limits = {
      ...idleRateLimits("claude"),
      session: { usedPercent: 100, windowMinutes: 300, resetsAt: 2_000 },
      weekly: { usedPercent: 40, windowMinutes: 10_080, resetsAt: 9_000 },
    };
    expect(exhaustedWindowResetAt(limits)).toBe(2_000);
    expect(exhaustedWindowResetAt(idleRateLimits("claude"))).toBeNull();
  });
});
