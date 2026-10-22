import {
  type ProviderRateLimits,
  SESSION_WINDOW_MINUTES,
  WEEKLY_WINDOW_MINUTES,
  MONTHLY_WINDOW_MINUTES,
  type RateLimitWindow,
} from "@/domain/rate-limits/rate-limit";
import { clampUsedPercent } from "@/domain/rate-limits/rate-limit-window";
import { numberField, parseResetTimestamp } from "../../core/usage-window";
import { asRecord } from "../codex/codex-protocol";

/**
 * Parse the official OpenCode Go usage payload:
 * { usage: { rolling: { status, percent, resetsAt },
 *            weekly: {...}, monthly: {...} } }
 * `percent` is percent used, matching the dashboard.
 */
export function parseOpencodeGoUsage(result: unknown): ProviderRateLimits {
  const rec = asRecord(result);
  const usage = asRecord(rec?.usage) ?? rec;
  return {
    provider: "opencode",
    session: mapOpencodeGoWindow(usage?.rolling, SESSION_WINDOW_MINUTES),
    weekly: mapOpencodeGoWindow(usage?.weekly, WEEKLY_WINDOW_MINUTES),
    monthly: mapOpencodeGoWindow(usage?.monthly, MONTHLY_WINDOW_MINUTES),
    resetCredits: null,
    updatedAt: Date.now(),
    error: null,
    status: "ok",
  };
}

function mapOpencodeGoWindow(
  raw: unknown,
  windowMinutes: number,
): RateLimitWindow | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  // Require an explicit valid status; unknown shapes are dropped so the
  // caller can treat a fully empty payload as an error, not a snapshot.
  const status = rec.status;
  if (status !== "ok" && status !== "rate-limited") return null;
  const usedPercent =
    numberField(rec, "percent") ?? numberField(rec, "usedPercent");
  if (usedPercent == null) return null;
  return {
    usedPercent: clampUsedPercent(usedPercent),
    windowMinutes,
    resetsAt:
      parseResetTimestamp(rec.resetsAt) ?? parseResetTimestamp(rec.resets_at),
  };
}
