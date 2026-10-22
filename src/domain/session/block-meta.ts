import type { Block } from "./block";
import type { HarnessId } from "../harness/harness";

export type PlanStatus = "streaming" | "ready" | "building" | "built";

export type PlanBlockMeta = {
  /** Provider or turn identity used to merge streamed snapshots. */
  key?: string;
  status: PlanStatus;
  /** Provider-authored plan before any user edits. */
  originalText?: string;
  /** Exact markdown the user approved with Build. */
  approvedText?: string;
  edited?: boolean;
};

export type HandoffStatus = "preparing" | "ready";

export type HandoffMeta = {
  from: HarnessId;
  to: HarnessId;
  status: HandoffStatus;
  /** Inject this brief into prompts to `to` until that harness accepts a turn. */
  pending?: boolean;
};
/** One persisted question/answer in a completed turn's side conversation. */
export type BtwMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  /** Rich harness activity for assistant replies, when available. */
  blocks?: Block[];
};

export type BtwThreadStatus = "running" | "ready" | "error";
/** Independent, read-only "by the way" conversation anchored to a turn. */
export type BtwThread = {
  id: string;
  sourceEndBlockId: string;
  createdAt: number;
  updatedAt: number;
  status: BtwThreadStatus;
  messages: BtwMessage[];
  /** Provider that answered this side thread. */
  harness?: HarnessId;
  /** Selected harness model for this side thread; absent means session default. */
  model?: string;
  /** Provider settings selected for this side thread's model. */
  modelSettings?: Record<string, string>;
  /** Provider-specific side-thread id when the text runner supports resume. */
  providerThreadId?: string;
  error?: string;
  /** Live harness blocks for the in-flight reply; not persisted. */
  pendingBlocks?: Block[];
};
/** Compact transcript card for a second-opinion or split-pane handoff turn. */
export type SecondOpinionMeta = {
  from: HarnessId;
  to: HarnessId;
  request?: string;
  files?: number;
  /** Split-pane continue. Default is a second-opinion review. */
  kind?: "handoff";
};
/** A mid-turn interjection the harness asked to surface, e.g. OMP advisor notes. */
export type InterjectionSeverity = "nit" | "concern" | "blocker";

export type InterjectionMeta = {
  customType: string;
  /** Highest severity among this interjection's retained notes, when any is known. */
  severity?: InterjectionSeverity;
};
