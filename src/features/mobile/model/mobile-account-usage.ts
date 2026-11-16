import { accountStatus } from "@/features/providers/model/account-usage";
import { providerAccounts } from "@/features/providers/model/provider-accounts";
import { clampUsedPercent } from "@/domain/rate-limits/rate-limit-window";
import { errorRateLimits } from "@/domain/rate-limits/rate-limit-state";
import {
  formatResetDuration,
  formatUsagePercent,
  formatWindowLabel,
} from "@/features/providers/model/rate-limits";
import type { ProviderRateLimits } from "@/domain/rate-limits/rate-limit";
import {
  getCachedRateLimits,
  loadRateLimits,
  setCachedRateLimits,
} from "@/features/providers/model/rate-limits-cache";
import { loadShowRemainingUsage } from "@/features/settings/model/display-prefs";

/** The footer's presentation, without credentials or provider-specific payloads. */
export function mobileUsageSnapshot(
  limits: ProviderRateLimits,
  now: number,
  showRemaining: boolean,
) {
  const windows = [
    { title: "5h", window: limits.session },
    { title: "Weekly", window: limits.weekly },
    { title: "Monthly", window: limits.monthly },
  ];
  return {
    status: accountStatus(limits, now),
    updatedAt: limits.updatedAt,
    stale: limits.status === "error" || limits.status === "fetching",
    meters: windows.flatMap(({ title, window }) => {
      if (!window) return [];
      const used = clampUsedPercent(window.usedPercent);
      const percent = showRemaining ? 100 - used : used;
      return [
        {
          title,
          usedPercent: used,
          percent,
          label: `${formatUsagePercent(percent)} ${showRemaining ? "left" : "used"}`,
          reset:
            window.resetsAt == null
              ? formatWindowLabel(window.windowMinutes)
              : window.resetsAt <= now
                ? "reset due"
                : `Resets in ${formatResetDuration(window.resetsAt - now)}`,
        },
      ];
    }),
  };
}

/** Uses the same cache as the desktop footer; only an explicit refresh probes again. */
export async function mobileAccountUsage(provider: unknown, refresh = false) {
  if (provider !== "claude" && provider !== "codex")
    throw new Error(
      "Usage is only available for Claude Code and Codex accounts",
    );
  const accounts = providerAccounts(provider);
  const snapshots = await Promise.all(
    accounts.map(async (account) => {
      const previous = getCachedRateLimits(provider, account.id);
      const limits = await loadRateLimits(provider, account.id, refresh);
      const snapshot =
        limits.status === "error" &&
        !limits.session &&
        !limits.weekly &&
        !limits.monthly
          ? errorRateLimits(
              provider,
              limits.error ?? "Usage unavailable",
              previous,
            )
          : limits;
      if (
        snapshot !== limits &&
        (snapshot.session || snapshot.weekly || snapshot.monthly)
      )
        setCachedRateLimits(provider, account.id, snapshot);
      return [account.id, snapshot] as const;
    }),
  );
  const now = Date.now();
  const showRemaining = loadShowRemainingUsage();
  return {
    accounts: Object.fromEntries(
      snapshots.map(([id, limits]) => [
        id,
        mobileUsageSnapshot(limits, now, showRemaining),
      ]),
    ),
  };
}
