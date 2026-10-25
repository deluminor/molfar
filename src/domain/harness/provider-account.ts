import type { HarnessId } from "./harness";

export const DEFAULT_PROVIDER_ACCOUNT_ID = "default";

/** Legacy sessions predate persisted account ids and belong to the default profile. */
export function sameProviderAccountId(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return (
    (left ?? DEFAULT_PROVIDER_ACCOUNT_ID) ===
    (right ?? DEFAULT_PROVIDER_ACCOUNT_ID)
  );
}

/** Providers listed under Accounts, each with at least its CLI's own login. */
export const PROVIDER_ACCOUNT_PROVIDERS = [
  "claude",
  "codex",
  "devin",
] as const satisfies readonly HarnessId[];

export type ProviderAccountProvider =
  (typeof PROVIDER_ACCOUNT_PROVIDERS)[number];

export function supportsProviderAccounts(
  provider: HarnessId,
): provider is ProviderAccountProvider {
  return PROVIDER_ACCOUNT_PROVIDERS.some((candidate) => candidate === provider);
}

/**
 * Providers whose CLIs can keep isolated, locally named profiles. Devin has
 * no config-dir override on Windows, so it offers only its default login.
 */
const PROFILE_PROVIDERS = [
  "claude",
  "codex",
] as const satisfies readonly ProviderAccountProvider[];

export type ProfileAccountProvider = (typeof PROFILE_PROVIDERS)[number];

export function supportsAccountProfiles(
  provider: HarnessId,
): provider is ProfileAccountProvider {
  return PROFILE_PROVIDERS.some((candidate) => candidate === provider);
}

export type ProviderAccount = {
  id: string;
  provider: ProviderAccountProvider;
  label: string;
  isDefault?: boolean;
};
