export type RateLimitProvider = "claude" | "codex" | "opencode";

export type RateLimitStatus =
  "idle" | "fetching" | "ok" | "error" | "unavailable";

export type RateLimitWindow = {
  /** Percentage of the window consumed (0–100). */
  usedPercent: number;
  /** Window duration in minutes: 300 (5h) or 10080 (7d). */
  windowMinutes: number;
  /** Unix ms timestamp when the window resets, if known. */
  resetsAt: number | null;
};

export type RateLimitResetCredit = {
  id: string;
  resetType: "codexRateLimits" | "unknown";
  status: "available" | "redeeming" | "redeemed" | "unknown";
  grantedAt: number | null;
  expiresAt: number | null;
  title: string | null;
  description: string | null;
};

export type RateLimitResetCredits = {
  availableCount: number;
  /** Optional detail rows; the backend can report only the aggregate count. */
  credits: RateLimitResetCredit[] | null;
};

export type ProviderRateLimits = {
  provider: RateLimitProvider;
  session: RateLimitWindow | null;
  weekly: RateLimitWindow | null;
  monthly: RateLimitWindow | null;
  /** Codex-only banked rate-limit reset rewards, when supplied by app-server. */
  resetCredits: RateLimitResetCredits | null;
  updatedAt: number;
  error: string | null;
  status: RateLimitStatus;
};

export const SESSION_WINDOW_MINUTES = 300;
export const WEEKLY_WINDOW_MINUTES = 10080;
export const MONTHLY_WINDOW_MINUTES = 43200;
