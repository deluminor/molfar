import { describe, expect, it } from "vitest";
import {
  SESSION_WINDOW_MINUTES,
  WEEKLY_WINDOW_MINUTES,
  type ProviderRateLimits,
} from "../../providers/model/rateLimits";
import {
  cardFromAntigravityBody,
  cardFromCursorBody,
  cardFromProviderRateLimits,
  cardFromUsageFetch,
  mergeUsageCard,
  usageBarTone,
} from "./usageCard";

function limits(
  partial: Partial<ProviderRateLimits> &
    Pick<ProviderRateLimits, "provider" | "status">,
): ProviderRateLimits {
  return {
    session: null,
    weekly: null,
    monthly: null,
    resetCredits: null,
    updatedAt: 100,
    error: null,
    ...partial,
  };
}

describe("cardFromProviderRateLimits", () => {
  it("maps Claude/Codex windows for an ok snapshot", () => {
    const card = cardFromProviderRateLimits(
      limits({
        provider: "claude",
        status: "ok",
        session: {
          usedPercent: 12,
          windowMinutes: SESSION_WINDOW_MINUTES,
          resetsAt: 200,
        },
        weekly: {
          usedPercent: 40,
          windowMinutes: WEEKLY_WINDOW_MINUTES,
          resetsAt: null,
        },
      }),
    );
    expect(card).toEqual({
      status: "ok",
      updatedAt: 100,
      windows: [
        {
          kind: "session",
          label: "Session",
          usedPercent: 12,
          resetsAt: 200,
        },
        {
          kind: "weekly",
          label: "Weekly",
          usedPercent: 40,
          resetsAt: null,
        },
      ],
    });
  });

  it("keeps prior windows when a later poll errors", () => {
    const ok = cardFromProviderRateLimits(
      limits({
        provider: "codex",
        status: "ok",
        session: {
          usedPercent: 5,
          windowMinutes: SESSION_WINDOW_MINUTES,
          resetsAt: null,
        },
      }),
    );
    const errored = cardFromProviderRateLimits(
      limits({
        provider: "codex",
        status: "error",
        error: "timeout",
        session: {
          usedPercent: 5,
          windowMinutes: SESSION_WINDOW_MINUTES,
          resetsAt: null,
        },
      }),
    );
    const merged = mergeUsageCard(ok, errored);
    expect(merged.status).toBe("error");
    if (merged.status === "error") {
      expect(merged.windows).toHaveLength(1);
      expect(merged.reason).toBe("timeout");
    }
  });
});

describe("cardFromCursorBody", () => {
  it("reads Auto and API model percents", () => {
    const card = cardFromCursorBody(
      JSON.stringify({
        billingCycleEnd: 1_791_741_687_000,
        planUsage: {
          autoPercentUsed: 19.49,
          apiPercentUsed: 84.17,
        },
      }),
    );
    expect(card.status).toBe("ok");
    if (card.status === "ok") {
      expect(card.windows.map((window) => window.kind)).toEqual([
        "auto",
        "api",
      ]);
      expect(card.windows[0]?.usedPercent).toBeCloseTo(19.49);
      expect(card.windows[1]?.usedPercent).toBeCloseTo(84.17);
    }
  });
});

describe("cardFromAntigravityBody", () => {
  it("surfaces session and weekly quotas when present", () => {
    const card = cardFromAntigravityBody(
      JSON.stringify({
        models: {
          flash: {
            displayName: "Flash",
            quotaInfo: { remainingFraction: 0.8, resetInterval: "5h" },
          },
          pro: {
            displayName: "Pro",
            quotaInfo: {
              remainingFraction: 0.1,
              resetInterval: "weekly",
              resetTime: 1_800_000_000,
            },
          },
        },
      }),
    );
    expect(card.status).toBe("ok");
    if (card.status === "ok") {
      expect(card.windows).toHaveLength(2);
      expect(card.windows[0]?.usedPercent).toBeCloseTo(20);
      expect(card.windows[1]?.kind).toBe("weekly");
    }
  });

  it("maps unavailable envelopes without inventing percents", () => {
    expect(
      cardFromUsageFetch(
        { status: "unavailable", error: "Antigravity CLI not signed in" },
        cardFromAntigravityBody,
      ),
    ).toEqual({
      status: "unavailable",
      reason: "Antigravity CLI not signed in",
    });
  });
});

describe("usageBarTone", () => {
  it("marks critical usage in red", () => {
    expect(usageBarTone(0)).toBe("low");
    expect(usageBarTone(55)).toBe("mid");
    expect(usageBarTone(99)).toBe("critical");
  });
});
