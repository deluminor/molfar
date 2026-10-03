import { invoke } from "@tauri-apps/api/core";
import {
  fetchClaudeRateLimits,
  fetchCodexRateLimits,
} from "../../providers/model/rateLimitsFetch";
import { selectedProviderAccountId } from "../../providers/model/providerAccounts";
import {
  cardFromAntigravityBody,
  cardFromCursorBody,
  cardFromProviderRateLimits,
  cardFromUsageFetch,
  mergeUsageCard,
  type UsageCardState,
  type UsageFetchEnvelope,
  type UsageProviderId,
} from "./usageCard";

export type UsageBoard = Record<UsageProviderId, UsageCardState>;

export function idleUsageBoard(): UsageBoard {
  return {
    claude: { status: "loading" },
    codex: { status: "loading" },
    cursor: { status: "loading" },
    antigravity: { status: "loading" },
  };
}

async function fetchCursorCard(): Promise<UsageCardState> {
  try {
    const envelope = await invoke<UsageFetchEnvelope>("usage_cursor_limits");
    return cardFromUsageFetch(envelope, cardFromCursorBody);
  } catch (error) {
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "Cursor usage unavailable",
      windows: [],
    };
  }
}

async function fetchAntigravityCard(): Promise<UsageCardState> {
  try {
    const envelope = await invoke<UsageFetchEnvelope>("usage_antigravity_limits");
    return cardFromUsageFetch(envelope, cardFromAntigravityBody);
  } catch (error) {
    return {
      status: "error",
      reason:
        error instanceof Error ? error.message : "Antigravity usage unavailable",
      windows: [],
    };
  }
}

/** Fetch all four Usage cards in parallel. */
export async function fetchUsageBoard(
  previous: UsageBoard,
  project?: string,
): Promise<UsageBoard> {
  const claudeAccount = selectedProviderAccountId("claude", project);
  const codexAccount = selectedProviderAccountId("codex", project);
  const [claude, codex, cursor, antigravity] = await Promise.all([
    fetchClaudeRateLimits(claudeAccount).then(cardFromProviderRateLimits),
    fetchCodexRateLimits(codexAccount).then(cardFromProviderRateLimits),
    fetchCursorCard(),
    fetchAntigravityCard(),
  ]);
  return {
    claude: mergeUsageCard(previous.claude, claude),
    codex: mergeUsageCard(previous.codex, codex),
    cursor: mergeUsageCard(previous.cursor, cursor),
    antigravity: mergeUsageCard(previous.antigravity, antigravity),
  };
}
