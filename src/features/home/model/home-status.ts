import type { Automation } from "@/features/automations/model/automations";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import {
  countEnabledAutomations,
  nextDueAutomationAt,
} from "./recent-automations";
import { countSessionsUpdatedWithin } from "./recent-sessions";

export type HomeStatus = {
  recentSessionCount: number;
  enabledAutomationCount: number;
  nextDueAt: number | null;
};

/** Operational Status slice for the Home Status card. */
export function buildHomeStatus(
  sessions: readonly SessionSummary[],
  automations: readonly Automation[],
  now = Date.now(),
): HomeStatus {
  return {
    recentSessionCount: countSessionsUpdatedWithin(sessions, now),
    enabledAutomationCount: countEnabledAutomations(automations),
    nextDueAt: nextDueAutomationAt(automations),
  };
}

export function formatNextDueAt(at: number | null, now = Date.now()): string {
  if (at == null || !Number.isFinite(at) || at <= 0) return "—";
  const delta = at - now;
  if (delta <= 0) return "due now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `in ${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}
