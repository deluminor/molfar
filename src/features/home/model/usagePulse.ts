import type { UsageCardState, UsageProviderId } from "../../usage/model/usageCard";
import { USAGE_PROVIDERS } from "../../usage/model/usageProviders";
import { primaryUsedPercent } from "../../usage/model/usageSnapshots";

export type UsagePulseRow = {
  provider: UsageProviderId;
  title: string;
  /** Null when the provider has no honest percent — show status instead. */
  usedPercent: number | null;
  statusLabel: string;
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

/** Compact multi-provider rows for the Home Usage strip. */
export function usagePulseRows(
  cards: ReadonlyMap<UsageProviderId, UsageCardState>,
): UsagePulseRow[] {
  return USAGE_PROVIDERS.map((provider) => {
    const state = cards.get(provider.id) ?? { status: "loading" as const };
    return {
      provider: provider.id,
      title: provider.title,
      usedPercent: primaryUsedPercent(state),
      statusLabel: statusLabel(state),
      fetching: state.status === "loading",
    };
  });
}
