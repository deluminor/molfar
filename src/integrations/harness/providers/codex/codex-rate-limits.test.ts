import { describe, expect, it } from "vitest";
import { parseCodexRateLimits } from "./codex-rate-limits";

describe("parseCodexRateLimits", () => {
  it("classifies primary/secondary by duration", () => {
    const limits = parseCodexRateLimits({
      rateLimits: {
        primary: {
          usedPercent: 52,
          windowDurationMins: 300,
          resetsAt: 1_738_425_600,
        },
        secondary: {
          used_percent: 37,
          window_duration_mins: 10_080,
          resets_at: 1_738_900_000,
        },
      },
    });
    expect(limits.session?.usedPercent).toBe(52);
    expect(limits.session?.windowMinutes).toBe(300);
    expect(limits.weekly?.usedPercent).toBe(37);
    expect(limits.weekly?.windowMinutes).toBe(10_080);
  });

  it("maps banked reset credits and their expiry", () => {
    const limits = parseCodexRateLimits({
      rateLimits: {
        primary: { usedPercent: 52, windowDurationMins: 300 },
      },
      rateLimitResetCredits: {
        availableCount: 2,
        credits: [
          {
            id: "reset-1",
            resetType: "codexRateLimits",
            status: "available",
            grantedAt: 1_788_768_000,
            expiresAt: 1_791_360_000,
            title: "Referral reward",
            description: "One Codex rate-limit reset",
          },
        ],
      },
    });

    expect(limits.resetCredits).toEqual({
      availableCount: 2,
      credits: [
        {
          id: "reset-1",
          resetType: "codexRateLimits",
          status: "available",
          grantedAt: 1_788_768_000_000,
          expiresAt: 1_791_360_000_000,
          title: "Referral reward",
          description: "One Codex rate-limit reset",
        },
      ],
    });
  });

  it("keeps an aggregate banked reset count without detail rows", () => {
    const limits = parseCodexRateLimits({
      rateLimits: {
        primary: { usedPercent: 12, windowDurationMins: 300 },
      },
      rate_limit_reset_credits: {
        available_count: "3",
        credits: null,
      },
    });

    expect(limits.resetCredits).toEqual({ availableCount: 3, credits: null });
  });

  it("maps a free plan's lone 30-day primary window to monthly", () => {
    const limits = parseCodexRateLimits({
      rateLimits: {
        primary: {
          usedPercent: 4,
          windowDurationMins: 43_200,
          resetsAt: 1_792_550_273,
        },
        secondary: null,
      },
    });
    expect(limits.session).toBeNull();
    expect(limits.weekly).toBeNull();
    expect(limits.monthly).toEqual({
      usedPercent: 4,
      windowMinutes: 43_200,
      resetsAt: 1_792_550_273_000,
    });
  });

  it("falls back to primary=session when durations are unknown", () => {
    const limits = parseCodexRateLimits({
      primary: { usedPercent: 10, resetsAt: 100 },
      secondary: { usedPercent: 20, resetsAt: 200 },
    });
    expect(limits.session?.usedPercent).toBe(10);
    expect(limits.weekly?.usedPercent).toBe(20);
  });
});
