import type { RateLimitProvider, ProviderRateLimits } from "./rate-limit";

export function idleRateLimits(
  provider: RateLimitProvider,
): ProviderRateLimits {
  return {
    provider,
    session: null,
    weekly: null,
    monthly: null,
    resetCredits: null,
    updatedAt: 0,
    error: null,
    status: "idle",
  };
}

export function fetchingRateLimits(
  provider: RateLimitProvider,
  previous?: ProviderRateLimits | null,
): ProviderRateLimits {
  if (
    previous &&
    (previous.session ||
      previous.weekly ||
      previous.monthly ||
      previous.resetCredits)
  ) {
    return { ...previous, status: "fetching" };
  }
  return {
    provider,
    session: previous?.session ?? null,
    weekly: previous?.weekly ?? null,
    monthly: previous?.monthly ?? null,
    resetCredits: previous?.resetCredits ?? null,
    updatedAt: previous?.updatedAt ?? 0,
    error: null,
    status: "fetching",
  };
}

export function unavailableRateLimits(
  provider: RateLimitProvider,
  error: string,
): ProviderRateLimits {
  return {
    provider,
    session: null,
    weekly: null,
    monthly: null,
    resetCredits: null,
    updatedAt: Date.now(),
    error,
    status: "unavailable",
  };
}

export function errorRateLimits(
  provider: RateLimitProvider,
  error: string,
  previous?: ProviderRateLimits | null,
): ProviderRateLimits {
  if (
    previous &&
    (previous.session ||
      previous.weekly ||
      previous.monthly ||
      previous.resetCredits)
  ) {
    return {
      ...previous,
      error,
      status: "error",
      updatedAt: Date.now(),
    };
  }
  return {
    provider,
    session: null,
    weekly: null,
    monthly: null,
    resetCredits: null,
    updatedAt: Date.now(),
    error,
    status: "error",
  };
}
