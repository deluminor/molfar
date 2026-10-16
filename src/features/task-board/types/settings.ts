import type { AgentStage, StageModelConfig } from "./stage";

/** Mirrors `task_board::settings::BoardSettings` in Rust. */
export type BoardSettings = {
  columns: Partial<Record<AgentStage, StageModelConfig>>;
  /**
   * Explicit skill lists per agent column. Absent key → auto-detect from
   * `STAGE_SKILLS` against the skill catalog. Present key (including `[]`) →
   * that exact list; missing names are omitted at launch with a chip warning.
   */
  columnSkills?: Partial<Record<AgentStage, string[]>>;
  maxConcurrentStages: number;
  stallMinutes: number;
};
