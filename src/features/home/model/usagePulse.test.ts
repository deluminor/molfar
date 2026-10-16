import { describe, expect, it } from "vitest";
import {
  idleRateLimits,
  type ProviderRateLimits,
} from "../../providers/model/rateLimits";
import { usagePulseRows } from "./usagePulse";

function limits(patch: Partial<ProviderRateLimits>): ProviderRateLimits {
  return { ...idleRateLimits("claude"), status: "ok", updatedAt: 1, ...patch };
}

describe("usagePulseRows", () => {
  it("is empty when no provider has reported a window", () => {
    expect(
      usagePulseRows([
        idleRateLimits("claude"),
        { ...idleRateLimits("devin"), status: "unavailable" },
      ]),
    ).toEqual([]);
  });

  it("lists reported windows per provider with clamped percentages", () => {
    const rows = usagePulseRows([
      limits({
        session: { usedPercent: 42.4, windowMinutes: 300, resetsAt: 10 },
        weekly: { usedPercent: 140, windowMinutes: 10_080, resetsAt: null },
      }),
      limits({
        provider: "codex",
        status: "fetching",
        monthly: { usedPercent: -3, windowMinutes: 43_200, resetsAt: null },
      }),
    ]);

    expect(rows).toEqual([
      {
        provider: "claude",
        fetching: false,
        windows: [
          { label: "5h", usedPercent: 42, resetsAt: 10 },
          { label: "7d", usedPercent: 100, resetsAt: null },
        ],
      },
      {
        provider: "codex",
        fetching: true,
        windows: [{ label: "30d", usedPercent: 0, resetsAt: null }],
      },
    ]);
  });
});
