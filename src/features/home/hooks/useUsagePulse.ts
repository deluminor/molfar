import { useEffect, useMemo, useState } from "react";
import { refreshUsageCards } from "../../usage/model/fetchUsage";
import {
  recordUsageSnapshots,
} from "../../usage/model/usageSnapshots";
import type { UsageCardState, UsageProviderId } from "../../usage/model/usageCard";
import { usagePulseRows, type UsagePulseRow } from "../model/usagePulse";

/** Loads the same provider cards as the Usage page for the Home strip. */
export function useUsagePulse(enabled = true): UsagePulseRow[] {
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

  return useMemo(
    () => (enabled ? usagePulseRows(cards) : []),
    [enabled, cards],
  );
}
