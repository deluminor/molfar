import {
  clampUsedPercent,
  formatResetCountdown,
  formatUsagePercent,
  type ProviderRateLimits,
  type RateLimitWindow,
} from "../../providers/model/rate-limits";

export type UsageProviderId = "claude" | "codex" | "cursor" | "antigravity";

export type UsageWindowKind = "session" | "weekly" | "monthly" | "auto" | "api";

export type UsageWindow = {
  kind: UsageWindowKind;
  label: string;
  usedPercent: number;
  resetsAt: number | null;
};

export type UsageCardState =
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string; windows: UsageWindow[] }
  | { status: "ok"; windows: UsageWindow[]; updatedAt: number };

export type UsageFetchEnvelope = {
  status: string;
  httpStatus?: number | null;
  body?: string | null;
  error?: string | null;
};

function windowFromRateLimit(
  kind: "session" | "weekly" | "monthly",
  label: string,
  window: RateLimitWindow | null,
): UsageWindow | null {
  if (!window) return null;
  return {
    kind,
    label,
    usedPercent: clampUsedPercent(window.usedPercent),
    resetsAt: window.resetsAt,
  };
}

/** Map Claude/Codex footer snapshots onto Usage cards. */
export function cardFromProviderRateLimits(
  limits: ProviderRateLimits,
): UsageCardState {
  const windows = [
    windowFromRateLimit("session", "Session", limits.session),
    windowFromRateLimit("weekly", "Weekly", limits.weekly),
    windowFromRateLimit("monthly", "Monthly", limits.monthly),
  ].filter((window): window is UsageWindow => window !== null);

  if (limits.status === "unavailable") {
    return {
      status: "unavailable",
      reason: limits.error?.trim() || "Not available",
    };
  }
  if (limits.status === "error") {
    return {
      status: "error",
      reason: limits.error?.trim() || "Usage unavailable",
      windows,
    };
  }
  if (limits.status === "idle" || limits.status === "fetching") {
    return windows.length > 0
      ? { status: "ok", windows, updatedAt: limits.updatedAt }
      : { status: "loading" };
  }
  if (windows.length === 0) {
    return { status: "unavailable", reason: "No usage windows reported" };
  }
  return { status: "ok", windows, updatedAt: limits.updatedAt };
}

/**
 * Keep the last successful windows when a later poll fails, matching the
 * footer chip behaviour.
 */
export function mergeUsageCard(
  previous: UsageCardState,
  next: UsageCardState,
): UsageCardState {
  if (next.status !== "error") return next;
  const priorWindows =
    previous.status === "ok" || previous.status === "error"
      ? previous.windows
      : [];
  if (priorWindows.length === 0) return next;
  return { ...next, windows: priorWindows };
}

function numberField(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Parse Cursor GetCurrentPeriodUsage JSON into Auto / API windows. */
export function cardFromCursorBody(body: string): UsageCardState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: "unavailable", reason: "Cursor usage response was not JSON" };
  }
  const root = asRecord(parsed);
  const plan = asRecord(root?.planUsage);
  if (!plan) {
    return { status: "unavailable", reason: "Cursor usage response was unexpected" };
  }
  const auto = numberField(plan, "autoPercentUsed");
  const api = numberField(plan, "apiPercentUsed");
  const endRaw = root?.billingCycleEnd;
  const resetsAt =
    typeof endRaw === "number"
      ? endRaw
      : typeof endRaw === "string" && /^\d+$/.test(endRaw)
        ? Number(endRaw)
        : null;
  const windows: UsageWindow[] = [];
  if (auto != null) {
    windows.push({
      kind: "auto",
      label: "Auto",
      usedPercent: clampUsedPercent(auto),
      resetsAt,
    });
  }
  if (api != null) {
    windows.push({
      kind: "api",
      label: "API models",
      usedPercent: clampUsedPercent(api),
      resetsAt,
    });
  }
  if (windows.length === 0) {
    return { status: "unavailable", reason: "Cursor usage windows missing" };
  }
  return { status: "ok", windows, updatedAt: Date.now() };
}

/**
 * Parse Antigravity fetchAvailableModels JSON. Quotas live under each model;
 * we surface distinct 5h / weekly windows when present.
 */
export function cardFromAntigravityBody(body: string): UsageCardState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      status: "unavailable",
      reason: "Antigravity usage response was not JSON",
    };
  }
  const root = asRecord(parsed);
  const models = asRecord(root?.models) ?? asRecord(root?.availableModels);
  if (!models) {
    return {
      status: "unavailable",
      reason: "Antigravity returned no model quotas",
    };
  }

  let session: UsageWindow | null = null;
  let weekly: UsageWindow | null = null;
  for (const value of Object.values(models)) {
    const model = asRecord(value);
    const quota = asRecord(model?.quotaInfo) ?? asRecord(model?.quota);
    if (!quota) continue;
    const remaining = numberField(quota, "remainingFraction");
    const used =
      remaining != null
        ? clampUsedPercent((1 - remaining) * 100)
        : numberField(quota, "usedPercent");
    if (used == null) continue;
    const reset =
      numberField(quota, "resetTime") ??
      numberField(quota, "resetsAt") ??
      null;
    const label =
      (typeof quota.resetInterval === "string" && quota.resetInterval) ||
      (typeof model?.displayName === "string" && model.displayName) ||
      "Quota";
    const isWeekly = /week/i.test(label) || /week/i.test(String(quota.window ?? ""));
    const window: UsageWindow = {
      kind: isWeekly ? "weekly" : "session",
      label: isWeekly ? "Weekly" : /5\s*h|five.?hour|session/i.test(label) ? "Session" : label,
      usedPercent: clampUsedPercent(used),
      resetsAt: reset != null && reset < 1e12 ? reset * 1000 : reset,
    };
    if (window.kind === "weekly") weekly ??= window;
    else session ??= window;
    if (session && weekly) break;
  }

  const windows = [session, weekly].filter(
    (window): window is UsageWindow => window !== null,
  );
  if (windows.length === 0) {
    return {
      status: "unavailable",
      reason: "Antigravity quota fields not found",
    };
  }
  return { status: "ok", windows, updatedAt: Date.now() };
}

export function cardFromUsageFetch(
  envelope: UsageFetchEnvelope,
  parseOk: (body: string) => UsageCardState,
): UsageCardState {
  if (envelope.status === "ok" && envelope.body) return parseOk(envelope.body);
  if (envelope.status === "unavailable") {
    return {
      status: "unavailable",
      reason: envelope.error?.trim() || "Not available",
    };
  }
  return {
    status: "error",
    reason: envelope.error?.trim() || "Usage unavailable",
    windows: [],
  };
}

export function usageWindowFooter(window: UsageWindow, now: number): string {
  if (window.resetsAt == null) return `${formatUsagePercent(window.usedPercent)} used`;
  return `${formatUsagePercent(window.usedPercent)} used · ${formatResetCountdown(window.resetsAt - now)}`;
}

export function usageBarTone(usedPercent: number): "low" | "mid" | "critical" {
  if (usedPercent >= 90) return "critical";
  if (usedPercent >= 50) return "mid";
  return "low";
}
