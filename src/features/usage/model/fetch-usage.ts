import { invoke } from "@tauri-apps/api/core";
import {
  fetchClaudeRateLimits,
  fetchCodexRateLimits,
} from "../../providers/model/rate-limits-fetch";
import {
  cardFromAntigravityBody,
  cardFromCursorBody,
  cardFromProviderRateLimits,
  cardFromUsageFetch,
  mergeUsageCard,
  type UsageCardState,
  type UsageFetchEnvelope,
  type UsageProviderId,
} from "./usage-card";

export async function fetchUsageCard(
  provider: UsageProviderId,
): Promise<UsageCardState> {
  switch (provider) {
    case "claude":
      return cardFromProviderRateLimits(await fetchClaudeRateLimits());
    case "codex":
      return cardFromProviderRateLimits(await fetchCodexRateLimits());
    case "cursor": {
      const envelope = await invoke<UsageFetchEnvelope>("usage_cursor_limits");
      return cardFromUsageFetch(envelope, cardFromCursorBody);
    }
    case "antigravity": {
      const envelope = await invoke<UsageFetchEnvelope>(
        "usage_antigravity_limits",
      );
      return cardFromUsageFetch(envelope, cardFromAntigravityBody);
    }
  }
}

export async function refreshUsageCards(
  previous: ReadonlyMap<UsageProviderId, UsageCardState>,
): Promise<Map<UsageProviderId, UsageCardState>> {
  const providers: UsageProviderId[] = [
    "claude",
    "codex",
    "cursor",
    "antigravity",
  ];
  const settled = await Promise.allSettled(
    providers.map(async (provider) => {
      const next = await fetchUsageCard(provider);
      const prior = previous.get(provider) ?? { status: "loading" as const };
      return [provider, mergeUsageCard(prior, next)] as const;
    }),
  );
  const next = new Map<UsageProviderId, UsageCardState>();
  for (const [index, result] of settled.entries()) {
    const provider = providers[index]!;
    if (result.status === "fulfilled") {
      next.set(provider, result.value[1]);
    } else {
      const prior = previous.get(provider) ?? { status: "loading" as const };
      next.set(
        provider,
        mergeUsageCard(prior, {
          status: "error",
          reason:
            result.reason instanceof Error
              ? result.reason.message
              : "Usage unavailable",
          windows: [],
        }),
      );
    }
  }
  return next;
}
