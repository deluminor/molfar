import { describe, expect, it } from "vitest";
import {
  formatRateLimitWindowChipLabel,
  formatResetCountdown,
  formatResetDuration,
  formatUsagePercent,
  formatWindowLabel,
  rateLimitWindowTooltip,
  formatExtraUsageBalance,
} from "./rate-limits";
import { clampUsedPercent } from "@/domain/rate-limits/rate-limit-window";

describe("formatWindowLabel", () => {
  it("uses the compact 5h / wk labels", () => {
    expect(formatWindowLabel(300)).toBe("5h");
    expect(formatWindowLabel(10_080)).toBe("wk");
    expect(formatWindowLabel(60)).toBe("1h");
    expect(formatWindowLabel(45)).toBe("45m");
    expect(formatWindowLabel(1_440)).toBe("1d");
  });
});

describe("formatResetDuration", () => {
  it("floors to whole units", () => {
    expect(formatResetDuration(47 * 60_000)).toBe("47m");
    expect(formatResetDuration(3 * 3_600_000 + 54 * 60_000)).toBe("3h 54m");
    expect(formatResetDuration(3 * 3_600_000)).toBe("3h");
    expect(formatResetDuration(6 * 86_400_000 + 7 * 3_600_000)).toBe("6d 7h");
    expect(formatResetDuration(2 * 86_400_000)).toBe("2d");
  });

  it("reports an expired window as now", () => {
    expect(formatResetDuration(0)).toBe("now");
    expect(formatResetDuration(-1_000)).toBe("now");
  });
});

describe("formatResetCountdown", () => {
  it("prefixes remaining time", () => {
    expect(formatResetCountdown(2 * 3_600_000 + 33 * 60_000)).toBe(
      "Resets in 2h 33m",
    );
    expect(formatResetCountdown(0)).toBe("Resets now");
  });
});

describe("formatRateLimitWindowChipLabel", () => {
  const now = Date.parse("2026-08-27T08:00:00Z");

  it("prefers remaining time when resetsAt is known", () => {
    expect(
      formatRateLimitWindowChipLabel(
        {
          usedPercent: 42,
          windowMinutes: 300,
          resetsAt: now + 2 * 3_600_000 + 33 * 60_000,
        },
        now,
      ),
    ).toBe("2h 33m");
  });

  it("falls back to the window size when no reset timestamp exists", () => {
    expect(
      formatRateLimitWindowChipLabel(
        { usedPercent: 42, windowMinutes: 300, resetsAt: null },
        now,
      ),
    ).toBe("5h");
    expect(
      formatRateLimitWindowChipLabel(
        { usedPercent: 41, windowMinutes: 10_080, resetsAt: null },
        now,
      ),
    ).toBe("wk");
  });
});

describe("formatUsagePercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatUsagePercent(58.4)).toBe("58%");
    expect(formatUsagePercent(58.6)).toBe("59%");
    expect(clampUsedPercent(140)).toBe(100);
  });
});

describe("formatExtraUsageBalance", () => {
  it("writes the balance the way Devin's plan panel does", () => {
    expect(formatExtraUsageBalance(-1.673099)).toBe("$-1.67");
  });
});

describe("rateLimitWindowTooltip", () => {
  it("includes used percent and remaining time", () => {
    const now = Date.parse("2026-08-27T08:00:00Z");
    expect(
      rateLimitWindowTooltip(
        {
          usedPercent: 42.4,
          windowMinutes: 300,
          resetsAt: now + 2 * 3_600_000 + 33 * 60_000,
        },
        now,
      ),
    ).toBe("42% used · Resets in 2h 33m");
  });

  it("shows remaining percent with a reset countdown", () => {
    const now = Date.parse("2026-08-27T08:00:00Z");
    expect(
      rateLimitWindowTooltip(
        {
          usedPercent: 42.4,
          windowMinutes: 300,
          resetsAt: now + 2 * 3_600_000,
        },
        now,
        true,
      ),
    ).toBe("58% remaining · Resets in 2h");
  });

  it.each([
    [0, "100%"],
    [100, "0%"],
    [-10, "100%"],
    [110, "0%"],
  ])(
    "clamps %s used before showing remaining usage",
    (usedPercent, remaining) => {
      expect(
        rateLimitWindowTooltip(
          { usedPercent, windowMinutes: 10_080, resetsAt: null },
          0,
          true,
        ),
      ).toBe(`${remaining} remaining · wk window`);
    },
  );
});
