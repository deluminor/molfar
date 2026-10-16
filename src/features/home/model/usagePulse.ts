import type {
  ProviderRateLimits,
  RateLimitProvider,
  RateLimitWindow,
} from "../../providers/model/rateLimits";

const MINUTES_PER_DAY = 1_440;

export type UsagePulseWindow = {
  label: string;
  usedPercent: number;
  resetsAt: number | null;
};

export type UsagePulseRow = {
  provider: RateLimitProvider;
  fetching: boolean;
  windows: UsagePulseWindow[];
};

function windowLabel(minutes: number): string {
  if (minutes < MINUTES_PER_DAY) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / MINUTES_PER_DAY)}d`;
}

function toPulseWindow(window: RateLimitWindow): UsagePulseWindow {
  return {
    label: windowLabel(window.windowMinutes),
    usedPercent: Math.round(Math.max(0, Math.min(100, window.usedPercent))),
    resetsAt: window.resetsAt,
  };
}

/** Providers with at least one reported window; signed-out ones are dropped. */
export function usagePulseRows(
  snapshots: readonly ProviderRateLimits[],
): UsagePulseRow[] {
  return snapshots.flatMap((limits) => {
    const windows = [limits.session, limits.weekly, limits.monthly]
      .filter((window): window is RateLimitWindow => window != null)
      .map(toPulseWindow);
    if (windows.length === 0) return [];
    return [
      {
        provider: limits.provider,
        fetching: limits.status === "fetching",
        windows,
      },
    ];
  });
}
