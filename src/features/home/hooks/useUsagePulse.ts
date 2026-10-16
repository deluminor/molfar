import { useEffect, useMemo } from "react";
import {
  providerAccountExists,
  selectedProviderAccountId,
} from "../../providers/model/providerAccounts";
import {
  loadRateLimits,
  useCachedRateLimits,
} from "../../providers/model/rateLimitsCache";
import { usagePulseRows, type UsagePulseRow } from "../model/usagePulse";

/** Reads the shared rate-limit cache the footer chips use; loads each account at most once. */
export function useUsagePulse(): UsagePulseRow[] {
  const claudeAccountId = selectedProviderAccountId("claude", undefined);
  const codexAccountId = selectedProviderAccountId("codex", undefined);
  const claude = useCachedRateLimits("claude", claudeAccountId);
  const codex = useCachedRateLimits("codex", codexAccountId);
  const opencode = useCachedRateLimits("opencode");
  const devin = useCachedRateLimits("devin");

  useEffect(() => {
    if (providerAccountExists("claude", claudeAccountId)) {
      void loadRateLimits("claude", claudeAccountId);
    }
    if (providerAccountExists("codex", codexAccountId)) {
      void loadRateLimits("codex", codexAccountId);
    }
    void loadRateLimits("opencode");
    void loadRateLimits("devin");
  }, [claudeAccountId, codexAccountId]);

  return useMemo(
    () => usagePulseRows([claude, codex, opencode, devin]),
    [claude, codex, opencode, devin],
  );
}
