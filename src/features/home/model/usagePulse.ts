import { formatResetDuration } from "../../providers/model/rateLimits";
import type { UsageCardState, UsageProviderId } from "../../usage/model/usageCard";
import { USAGE_PROVIDERS } from "../../usage/model/usageProviders";
import { primaryUsedPercent } from "../../usage/model/usageSnapshots";

export type UsagePulseRow = {
  provider: UsageProviderId;
  title: string;
  /** Null when the provider has no honest percent — show status instead. */
  usedPercent: number | null;
  statusLabel: string;
  /** Short reset remainder when known; never invented. */
  resetLabel: string | null;
  fetching: boolean;
};

function statusLabel(state: UsageCardState): string {
  switch (state.status) {
    case "loading":
      return "Loading";
    case "unavailable":
      return state.reason.trim() || "Unavailable";
    case "error":
      return state.reason.trim() || "Error";
    case "ok":
      return state.windows[0]?.label ?? "Ready";
  }
}

function resetLabel(state: UsageCardState, now: number): string | null {
  if (state.status !== "ok" && state.status !== "error") return null;
  const resetsAt = state.windows[0]?.resetsAt;
  if (resetsAt == null || !Number.isFinite(resetsAt)) return null;
  return formatResetDuration(resetsAt - now);
}

/** Compact multi-provider rows for the Home Usage widget. */
export function usagePulseRows(
  cards: ReadonlyMap<UsageProviderId, UsageCardState>,
  now = Date.now(),
): UsagePulseRow[] {
  return USAGE_PROVIDERS.map((provider) => {
    const state = cards.get(provider.id) ?? { status: "loading" as const };
    return {
      provider: provider.id,
      title: provider.title,
      usedPercent: primaryUsedPercent(state),
      statusLabel: statusLabel(state),
      resetLabel: resetLabel(state, now),
      fetching: state.status === "loading",
    };
  });
}
