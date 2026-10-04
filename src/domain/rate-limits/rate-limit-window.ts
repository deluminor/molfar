import type { ProviderRateLimits } from "./rate-limit";

export function clampUsedPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** When a used-up window resets; the later one when several are spent. */
export function exhaustedWindowResetAt(
  limits: ProviderRateLimits,
): number | null {
  let latest: number | null = null;
  for (const window of [limits.session, limits.weekly, limits.monthly]) {
    if (!window || window.usedPercent < 100 || window.resetsAt == null)
      continue;
    latest = Math.max(latest ?? 0, window.resetsAt);
  }
  return latest;
}
