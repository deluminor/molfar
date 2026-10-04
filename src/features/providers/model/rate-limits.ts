import {
  WEEKLY_WINDOW_MINUTES,
  MONTHLY_WINDOW_MINUTES,
  SESSION_WINDOW_MINUTES,
  type RateLimitWindow,
} from "@/domain/rate-limits/rate-limit";
import { clampUsedPercent } from "@/domain/rate-limits/rate-limit-window";

export const RATE_LIMIT_POLL_MS = 15 * 60_000;
export const RATE_LIMIT_MIN_REFETCH_MS = 5 * 60_000;

export function formatUsagePercent(usedPercent: number): string {
  return `${Math.round(clampUsedPercent(usedPercent))}%`;
}

/**
 * Compact window-size label. 10080 minutes stays "wk" to match the
 * original status-bar copy.
 */
export function formatWindowLabel(windowMinutes: number): string {
  if (windowMinutes === WEEKLY_WINDOW_MINUTES) return "wk";
  if (windowMinutes === MONTHLY_WINDOW_MINUTES) return "mo";
  if (windowMinutes === SESSION_WINDOW_MINUTES) return "5h";
  if (windowMinutes === 60) return "1h";
  if (windowMinutes < 60) return `${windowMinutes}m`;
  if (windowMinutes % (60 * 24 * 7) === 0) {
    return `${windowMinutes / (60 * 24 * 7)}wk`;
  }
  if (windowMinutes % (60 * 24) === 0) {
    return `${windowMinutes / (60 * 24)}d`;
  }
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60}h`;
  return `${windowMinutes}m`;
}

/**
 * Compact remaining duration, flooring to whole units: "47m", "3h 54m",
 * "6d 7h". Returns "now" once the window has already reset.
 */
export function formatResetDuration(ms: number): string {
  if (ms <= 0) return "now";
  const totalMins = Math.floor(ms / 60_000);
  if (totalMins < 60) return `${totalMins}m`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatResetCountdown(ms: number): string {
  const duration = formatResetDuration(ms);
  return duration === "now" ? "Resets now" : `Resets in ${duration}`;
}

/**
 * Status-bar chip label. Prefer remaining time when resetsAt is known;
 * fall back to the fixed window size otherwise.
 */
export function formatRateLimitWindowChipLabel(
  window: RateLimitWindow,
  now = Date.now(),
): string {
  if (window.resetsAt != null) {
    return formatResetDuration(window.resetsAt - now);
  }
  return formatWindowLabel(window.windowMinutes);
}

export function rateLimitWindowTooltip(
  window: RateLimitWindow,
  now = Date.now(),
): string {
  const used = `${formatUsagePercent(window.usedPercent)} used`;
  if (window.resetsAt == null) {
    return `${used} · ${formatWindowLabel(window.windowMinutes)} window`;
  }
  return `${used} · ${formatResetCountdown(window.resetsAt - now)}`;
}

