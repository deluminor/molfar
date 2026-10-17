import type { UsageCardState, UsageProviderId } from "./usageCard";

export const USAGE_SNAPSHOTS_STORAGE_KEY = "molfar.usageSnapshots.v1";
export const USAGE_SNAPSHOT_LIMIT = 366;

export type UsageDaySnapshot = {
  dateKey: string;
  /** Primary used % per provider when that day had a real reading. */
  providers: Partial<Record<UsageProviderId, number>>;
};

export type UsageTrendPoint = {
  dateKey: string;
  /** Mean of providers that reported that day; null when none did. */
  value: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampPercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function localDateKey(ms: number): string {
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Primary window % from an ok/error card — never invents a value. */
export function primaryUsedPercent(state: UsageCardState): number | null {
  if (state.status !== "ok" && state.status !== "error") return null;
  const window = state.windows[0];
  if (!window) return null;
  return clampPercent(window.usedPercent);
}

export function parseUsageSnapshots(value: unknown): UsageDaySnapshot[] {
  if (!Array.isArray(value)) return [];
  const out: UsageDaySnapshot[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record || typeof record.dateKey !== "string") continue;
    const providersRaw = asRecord(record.providers);
    if (!providersRaw) continue;
    const providers: Partial<Record<UsageProviderId, number>> = {};
    for (const [key, raw] of Object.entries(providersRaw)) {
      if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
      if (
        key === "claude" ||
        key === "codex" ||
        key === "cursor" ||
        key === "antigravity"
      ) {
        providers[key] = clampPercent(raw);
      }
    }
    out.push({ dateKey: record.dateKey, providers });
  }
  return out;
}

export function loadUsageSnapshots(): UsageDaySnapshot[] {
  try {
    const raw = localStorage.getItem(USAGE_SNAPSHOTS_STORAGE_KEY);
    if (raw == null) return [];
    return parseUsageSnapshots(JSON.parse(raw) as unknown);
  } catch (error) {
    console.error("Failed to load usage snapshots:", error);
    return [];
  }
}

export function saveUsageSnapshots(snapshots: readonly UsageDaySnapshot[]): boolean {
  try {
    localStorage.setItem(
      USAGE_SNAPSHOTS_STORAGE_KEY,
      JSON.stringify(snapshots.slice(-USAGE_SNAPSHOT_LIMIT)),
    );
    return true;
  } catch (error) {
    console.error("Failed to save usage snapshots:", error);
    return false;
  }
}

/**
 * Merge today's real provider readings into the snapshot series.
 * Providers without a percent are left untouched for that day.
 */
export function recordUsageSnapshots(
  cards: ReadonlyMap<UsageProviderId, UsageCardState>,
  at = Date.now(),
  previous: readonly UsageDaySnapshot[] = loadUsageSnapshots(),
): UsageDaySnapshot[] {
  const dateKey = localDateKey(at);
  const readings: Partial<Record<UsageProviderId, number>> = {};
  for (const [provider, state] of cards) {
    const percent = primaryUsedPercent(state);
    if (percent != null) readings[provider] = percent;
  }
  if (Object.keys(readings).length === 0) return [...previous];

  const next = [...previous];
  const index = next.findIndex((row) => row.dateKey === dateKey);
  if (index >= 0) {
    next[index] = {
      dateKey,
      providers: { ...next[index]!.providers, ...readings },
    };
  } else {
    next.push({ dateKey, providers: readings });
  }
  const trimmed = next
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(-USAGE_SNAPSHOT_LIMIT);
  saveUsageSnapshots(trimmed);
  return trimmed;
}

/** Mean primary % per day for the trend chart — gaps stay null (honest). */
export function usageTrendSeries(
  snapshots: readonly UsageDaySnapshot[],
): UsageTrendPoint[] {
  return snapshots.map((row) => {
    const values = Object.values(row.providers).filter(
      (value): value is number => typeof value === "number",
    );
    if (values.length === 0) return { dateKey: row.dateKey, value: null };
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { dateKey: row.dateKey, value: clampPercent(mean) };
  });
}
