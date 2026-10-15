import type { AgentStage } from "../types/stage";
import type { BoardColumn } from "../types/card";

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  "backlog",
  "grill",
  "plan_approval",
  "implement",
  "code_review",
  "final_review",
  "rework",
  "done",
];

export const COLUMN_LABEL: Record<BoardColumn, string> = {
  backlog: "Backlog",
  grill: "Grill",
  plan_approval: "Plan approval",
  implement: "Implement",
  code_review: "Code review",
  final_review: "Final review",
  rework: "Rework",
  done: "Done",
};

export const AGENT_STAGES: readonly AgentStage[] = [
  "grill",
  "implement",
  "code_review",
  "rework",
];

/** Stages whose checkout must be byte-identical before and after the run. */
export const READ_ONLY_STAGES: readonly AgentStage[] = ["grill", "code_review"];

export const MANUAL_GATES: readonly BoardColumn[] = [
  "plan_approval",
  "final_review",
];

export function isAgentStage(column: BoardColumn): column is AgentStage {
  return (AGENT_STAGES as readonly string[]).includes(column);
}
