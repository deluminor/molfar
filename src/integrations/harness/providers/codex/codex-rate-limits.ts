import {
  type ProviderRateLimits,
  SESSION_WINDOW_MINUTES,
  WEEKLY_WINDOW_MINUTES,
  MONTHLY_WINDOW_MINUTES,
  type RateLimitResetCredits,
  type RateLimitResetCredit,
  type RateLimitWindow,
} from "@/domain/rate-limits/rate-limit";
import { clampUsedPercent } from "@/domain/rate-limits/rate-limit-window";
import {
  numberField,
  parseResetTimestamp,
  stringField,
} from "../../core/usage-window";
import { asRecord } from "./codex-protocol";

export const WINDOW_DURATION_TOLERANCE_MINUTES = 1;

type CodexWindowSnapshot = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: unknown;
};

export function parseCodexRateLimits(result: unknown): ProviderRateLimits {
  const rec = asRecord(result);
  const wrapper = asRecord(rec?.rateLimits) ?? rec;
  const classified = classifyCodexWindows({
    primary: snapshotFrom(asRecord(wrapper?.primary)),
    secondary: snapshotFrom(asRecord(wrapper?.secondary)),
  });
  return {
    provider: "codex",
    session: mapCodexSnapshot(classified.session, SESSION_WINDOW_MINUTES),
    weekly: mapCodexSnapshot(classified.weekly, WEEKLY_WINDOW_MINUTES),
    monthly: mapCodexSnapshot(classified.monthly, MONTHLY_WINDOW_MINUTES),
    resetCredits: parseResetCredits(
      rec?.rateLimitResetCredits ?? rec?.rate_limit_reset_credits,
    ),
    updatedAt: Date.now(),
    error: null,
    status: "ok",
  };
}

function parseResetCredits(raw: unknown): RateLimitResetCredits | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const count =
    numberField(rec, "availableCount") ?? numberField(rec, "available_count");
  if (count == null) return null;
  const rawCredits = rec.credits;
  const credits = Array.isArray(rawCredits)
    ? rawCredits
        .map(parseResetCredit)
        .filter((credit): credit is RateLimitResetCredit => credit != null)
    : null;
  return {
    availableCount: Math.max(0, Math.floor(count)),
    credits,
  };
}

function parseResetCredit(raw: unknown): RateLimitResetCredit | null {
  const rec = asRecord(raw);
  if (!rec || typeof rec.id !== "string" || rec.id.trim() === "") {
    return null;
  }
  const resetType =
    rec.resetType === "codexRateLimits" ? "codexRateLimits" : "unknown";
  const status =
    rec.status === "available" ||
    rec.status === "redeeming" ||
    rec.status === "redeemed"
      ? rec.status
      : "unknown";
  return {
    id: rec.id,
    resetType,
    status,
    grantedAt: parseResetTimestamp(rec.grantedAt ?? rec.granted_at),
    expiresAt: parseResetTimestamp(rec.expiresAt ?? rec.expires_at),
    title: stringField(rec, "title"),
    description: stringField(rec, "description"),
  };
}

function snapshotFrom(
  rec: Record<string, unknown> | null,
): CodexWindowSnapshot | null {
  if (!rec) return null;
  const usedPercent =
    numberField(rec, "usedPercent") ??
    numberField(rec, "used_percent") ??
    numberField(rec, "used_percentage");
  if (usedPercent == null) return null;
  return {
    usedPercent,
    windowDurationMins:
      numberField(rec, "windowDurationMins") ??
      numberField(rec, "window_duration_mins") ??
      null,
    resetsAt: rec.resetsAt ?? rec.resets_at,
  };
}

function classifyCodexWindows(input: {
  primary: CodexWindowSnapshot | null;
  secondary: CodexWindowSnapshot | null;
}): {
  session: CodexWindowSnapshot | null;
  weekly: CodexWindowSnapshot | null;
  monthly: CodexWindowSnapshot | null;
} {
  let session: CodexWindowSnapshot | null = null;
  let weekly: CodexWindowSnapshot | null = null;
  let monthly: CodexWindowSnapshot | null = null;
  for (const window of [input.primary, input.secondary]) {
    if (!window) continue;
    const kind = classifyWindowDuration(window.windowDurationMins);
    if (kind === "session" && !session) session = window;
    else if (kind === "weekly" && !weekly) weekly = window;
    else if (kind === "monthly" && !monthly) monthly = window;
  }
  if (
    !session &&
    input.primary &&
    classifyWindowDuration(input.primary.windowDurationMins) === null
  ) {
    session = input.primary;
  }
  if (
    !weekly &&
    input.secondary &&
    classifyWindowDuration(input.secondary.windowDurationMins) === null
  ) {
    weekly = input.secondary;
  }
  return { session, weekly, monthly };
}

function classifyWindowDuration(
  duration: number | null,
): "session" | "weekly" | "monthly" | null {
  if (duration == null || !Number.isFinite(duration)) return null;
  if (
    Math.abs(duration - SESSION_WINDOW_MINUTES) <=
    WINDOW_DURATION_TOLERANCE_MINUTES
  ) {
    return "session";
  }
  if (
    Math.abs(duration - WEEKLY_WINDOW_MINUTES) <=
    WINDOW_DURATION_TOLERANCE_MINUTES
  ) {
    return "weekly";
  }
  // Free plans get a single 30-day window.
  if (
    Math.abs(duration - MONTHLY_WINDOW_MINUTES) <=
    WINDOW_DURATION_TOLERANCE_MINUTES
  ) {
    return "monthly";
  }
  return null;
}

function mapCodexSnapshot(
  raw: CodexWindowSnapshot | null,
  windowMinutes: number,
): RateLimitWindow | null {
  if (!raw) return null;
  return {
    usedPercent: clampUsedPercent(raw.usedPercent),
    windowMinutes,
    resetsAt: parseResetTimestamp(raw.resetsAt),
  };
}
