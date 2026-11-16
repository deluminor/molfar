import { useEffect, useMemo, useState } from "react";
import { refreshUsageCards } from "@/features/usage/model/fetch-usage";
import {
  recordUsageSnapshots,
} from "@/features/usage/model/usage-snapshots";
import type { UsageCardState, UsageProviderId } from "@/features/usage/model/usage-card";
import { isUsageCardsPending } from "@/features/usage/model/usage-providers";
import { usagePulseRows, type UsagePulseRow } from "../model/usage-pulse";

export type UsagePulseState = {
  rows: UsagePulseRow[];
  pending: boolean;
};

/** Loads the same provider cards as the Usage page for the Home strip. */
export function useUsagePulse(enabled = true): UsagePulseState {
  const [cards, setCards] = useState(
    () => new Map<UsageProviderId, UsageCardState>(),
  );

  useEffect(() => {
    if (!enabled) {
      setCards(new Map());
      return;
    }

    let alive = true;
    void refreshUsageCards(new Map()).then((next) => {
      if (!alive) return;
      setCards(next);
      recordUsageSnapshots(next);
    });

    return () => {
      alive = false;
    };
  }, [enabled]);

  return useMemo((): UsagePulseState => {
    if (!enabled) return { rows: [], pending: false };
    return {
      rows: usagePulseRows(cards),
      pending: isUsageCardsPending(cards),
    };
  }, [enabled, cards]);
}
