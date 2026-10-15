import type { HarnessId, RuntimeMode } from "../../sessions/model/session";

export type AgentStage = "grill" | "implement" | "code_review" | "rework";

export type DispatchStep =
  | "accepted"
  | "session_prepared"
  | "turn_submitted"
  | "settled";

export type StageStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

/** Mirrors `task_board::types::StageRun` in Rust. */
export type StageRun = {
  id: string;
  cardId: string;
  stage: AgentStage;
  attempt: number;
  sessionId: string | null;
  harness: string;
  model: string;
  settingsJson: string;
  runtimeMode: RuntimeMode;
  templateVersion: number;
  dispatch: DispatchStep;
  status: StageStatus;
  error: string | null;
  headBefore: string | null;
  porcelainBefore: string | null;
  fingerprintBefore: string | null;
  headAfter: string | null;
  startedAt: number;
  completedAt: number | null;
};

export type StageRunCreate = {
  id: string;
  cardId: string;
  stage: AgentStage;
  harness: HarnessId;
  model: string;
  settingsJson: string;
  runtimeMode: RuntimeMode;
  templateVersion: number;
};

export type StageRunPatch = Partial<
  Pick<
    StageRun,
    | "sessionId"
    | "dispatch"
    | "status"
    | "error"
    | "headBefore"
    | "porcelainBefore"
    | "fingerprintBefore"
    | "headAfter"
  >
>;

/** A column default or a card override; omitted fields fall back. */
export type StageModelConfig = {
  harness: HarnessId;
  model: string;
  effort?: string;
  runtimeMode: RuntimeMode;
};

export type StageOverrides = Partial<
  Record<AgentStage, Partial<StageModelConfig>>
>;
