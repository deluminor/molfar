import type { AgentStage, StageModelConfig } from "./stage";

/** Mirrors `task_board::settings::BoardSettings` in Rust. */
export type BoardSettings = {
  columns: Partial<Record<AgentStage, StageModelConfig>>;
  maxConcurrentStages: number;
  stallMinutes: number;
};
