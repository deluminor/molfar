import {
  type ProviderRateLimits,
  SESSION_WINDOW_MINUTES,
  WEEKLY_WINDOW_MINUTES,
} from "@/domain/rate-limits/rate-limit";
import { errorRateLimits } from "@/domain/rate-limits/rate-limit-state";
import { mapUsageWindow } from "../../core/usage-window";
import { asRecord } from "../codex/codex-protocol";

export function parseClaudeOAuthUsage(body: string): ProviderRateLimits {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errorRateLimits("claude", "Claude usage response was not JSON");
  }
  const rec = asRecord(parsed);
  if (!rec) {
    return errorRateLimits("claude", "Claude usage response was empty");
  }
  return {
    provider: "claude",
    session: mapUsageWindow(rec.five_hour, SESSION_WINDOW_MINUTES),
    weekly: mapUsageWindow(rec.seven_day, WEEKLY_WINDOW_MINUTES),
    monthly: null,
    resetCredits: null,
    updatedAt: Date.now(),
    error: null,
    status: "ok",
  };
}
