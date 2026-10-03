/** One-shot behavior selected in the composer for the next harness turn. */

import type { HarnessId } from "../harness/harness";

export type TurnIntent = "default" | "plan" | "build" | "orchestrate";
export type EditedResendRejection = {
  /** The provider removed the old turn, so retry as a normal unsent prompt. */
  providerRewound: boolean;
};
export type ComposerTurnOptions = {
  intent?: TurnIntent;
  resendEdited?: boolean;
  /** Restore an edited prompt when the resend rejects asynchronously. */
  onResendRejected?: (recovery: EditedResendRejection) => void;
  /** Promote an existing unsent transcript block instead of appending a turn. */
  draftBlockId?: string;
};
export type ModelTarget = {
  harness: HarnessId;
  model: string;
  modelSettings: Record<string, string>;
};

export type PlanBuildTarget = ModelTarget;
/** Provider/model provenance captured when a user turn is submitted. */
export type TurnModel = {
  harness: HarnessId;
  id: string;
  name: string;
};
/** Provider-reported token accounting for one user turn. */
export type TurnMetrics = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Provider-normalized share of input served from cache, as a percentage. */
  cacheHitPercent?: number;
};
