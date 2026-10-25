import {
  DAILY_WINDOW_MINUTES,
  type ProviderRateLimits,
  type RateLimitWindow,
  WEEKLY_WINDOW_MINUTES,
} from "@/domain/rate-limits/rate-limit";
import { clampUsedPercent } from "@/domain/rate-limits/rate-limit-window";
import { parseResetTimestamp } from "../../core/usage-window";

/** What the `fetch_devin_usage` command reads from Devin's user status. */
export type DevinUsage = {
  name?: string | null;
  email?: string | null;
  plan?: string | null;
  dailyRemainingPercent?: number | null;
  dailyResetsAt?: number | null;
  weeklyRemainingPercent?: number | null;
  weeklyResetsAt?: number | null;
  extraUsageBalanceMicros?: number | null;
};

/** Devin reports remaining quota; MOLFAR meters show the share used. */
export function parseDevinUsage(usage: DevinUsage): ProviderRateLimits {
  const window = (
    remaining: number | null | undefined,
    resetsAt: number | null | undefined,
    windowMinutes: number,
  ): RateLimitWindow | null =>
    remaining == null || !Number.isFinite(remaining)
      ? null
      : {
          usedPercent: clampUsedPercent(100 - remaining),
          windowMinutes,
          resetsAt: parseResetTimestamp(resetsAt),
        };
  return {
    provider: "devin",
    session: window(usage.dailyRemainingPercent, usage.dailyResetsAt, DAILY_WINDOW_MINUTES),
    weekly: window(usage.weeklyRemainingPercent, usage.weeklyResetsAt, WEEKLY_WINDOW_MINUTES),
    monthly: null,
    resetCredits: null,
    extraUsageBalance:
      usage.extraUsageBalanceMicros == null || !Number.isFinite(usage.extraUsageBalanceMicros)
        ? null
        : usage.extraUsageBalanceMicros / 1_000_000,
    updatedAt: Date.now(),
    error: null,
    status: "ok",
  };
}
