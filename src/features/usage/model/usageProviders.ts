import type { UsageCardState, UsageProviderId } from "./usageCard";

/** Preferred Usage order when the provider is connected. */
export const PREFERRED_USAGE_PROVIDERS = [
  "claude",
  "codex",
  "cursor",
] as const satisfies readonly UsageProviderId[];

/**
 * Catalog of Usage providers. Preferred trio first; extras follow harness order.
 * Presence in this list does not imply the provider is connected — filter with
 * {@link listedUsageProviders}.
 */
export const USAGE_PROVIDERS: readonly {
  id: UsageProviderId;
  title: string;
}[] = [
  { id: "claude", title: "Claude" },
  { id: "codex", title: "Codex" },
  { id: "cursor", title: "Cursor" },
  { id: "antigravity", title: "Antigravity" },
];

/**
 * Stable display order: Claude → Codex → Cursor, then every other id in
 * {@link USAGE_PROVIDERS} order. Unknown ids are ignored.
 */
export function orderUsageProviders(
  providers: readonly UsageProviderId[],
): UsageProviderId[] {
  const present = new Set(providers);
  const preferred = PREFERRED_USAGE_PROVIDERS.filter((id) => present.has(id));
  const rest = USAGE_PROVIDERS.map((entry) => entry.id).filter(
    (id) =>
      present.has(id) &&
      !PREFERRED_USAGE_PROVIDERS.some((preferredId) => preferredId === id),
  );
  return [...preferred, ...rest];
}

/**
 * Whether a card should appear on Usage surfaces. Unavailable means not
 * connected — omit entirely. Missing cards are not listed (initial load uses
 * {@link isUsageCardsPending} + a neutral skeleton instead of fake titles).
 */
export function isUsageProviderListed(
  state: UsageCardState | undefined,
): boolean {
  return state != null && state.status !== "unavailable";
}

/**
 * True before the first usage fetch settles — empty map, or every known card
 * still in `loading` with no settled result yet.
 */
export function isUsageCardsPending(
  cards: ReadonlyMap<UsageProviderId, UsageCardState>,
): boolean {
  if (cards.size === 0) return true;

  return USAGE_PROVIDERS.every((entry) => {
    const state = cards.get(entry.id);
    return state == null || state.status === "loading";
  });
}

/**
 * Connected (or still-loading once present) providers in preferred display order.
 * Empty when every known provider is unavailable, or before any card exists.
 */
export function listedUsageProviders(
  cards: ReadonlyMap<UsageProviderId, UsageCardState>,
): UsageProviderId[] {
  const available = USAGE_PROVIDERS.map((entry) => entry.id).filter((id) =>
    isUsageProviderListed(cards.get(id)),
  );
  return orderUsageProviders(available);
}

/** Human title for a Usage provider id. */
export function usageProviderTitle(id: UsageProviderId): string {
  return USAGE_PROVIDERS.find((provider) => provider.id === id)?.title ?? id;
}
