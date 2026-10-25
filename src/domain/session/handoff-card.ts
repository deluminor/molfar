import type { HarnessId } from "../harness/harness";

/** Composer chip: recap is injected on send so the user can add context first. */
export type HandoffComposerCard = {
  from: HarnessId;
  to: HarnessId;
  brief: string;
  request?: string;
  files?: number;
};
