import {
  formatAutomationRunAt,
  listAutomations,
  type Automation,
} from "../../automations/model/automations";

export { formatAutomationRunAt };

export type RecentAutomationRow = {
  id: string;
  name: string;
  enabled: boolean;
  nextRunAt: number;
  lastRunStatus: string | null;
  createdAt: number;
};

/** Newest automations by createdAt, capped at `limit`. */
export async function loadRecentAutomations(
  limit = 3,
): Promise<RecentAutomationRow[]> {
  const automations = await listAutomations();
  return pickRecentAutomations(automations, limit);
}

export function pickRecentAutomations(
  automations: readonly Automation[],
  limit: number,
): RecentAutomationRow[] {
  return [...automations]
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit))
    .map((automation) => ({
      id: automation.id,
      name: automation.name.trim() || "Untitled",
      enabled: automation.enabled,
      nextRunAt: automation.nextRunAt,
      lastRunStatus: automation.lastRunStatus ?? null,
      createdAt: automation.createdAt,
    }));
}

export function countEnabledAutomations(
  automations: readonly Automation[],
): number {
  return automations.filter((automation) => automation.enabled).length;
}

/** Soonest nextRunAt among enabled automations; null when none are due. */
export function nextDueAutomationAt(
  automations: readonly Automation[],
): number | null {
  let soonest: number | null = null;
  for (const automation of automations) {
    if (!automation.enabled) continue;
    if (!Number.isFinite(automation.nextRunAt) || automation.nextRunAt <= 0) {
      continue;
    }
    soonest =
      soonest == null
        ? automation.nextRunAt
        : Math.min(soonest, automation.nextRunAt);
  }
  return soonest;
}

const FAILED_RUN_STATUSES: ReadonlySet<string> = new Set([
  "failed",
  "cancelled",
]);

/** Failed/cancelled runs stay visible; otherwise the next due time is the useful signal. */
export function automationRowMeta(automation: RecentAutomationRow): {
  label: string;
  failed: boolean;
} {
  if (!automation.enabled) return { label: "paused", failed: false };
  const status = automation.lastRunStatus;
  if (status && FAILED_RUN_STATUSES.has(status)) {
    return { label: status, failed: true };
  }
  if (automation.nextRunAt > 0) {
    return { label: formatAutomationRunAt(automation.nextRunAt), failed: false };
  }
  return { label: status ?? "—", failed: false };
}
