import type { AgentStage } from "../types/stage";

/**
 * Default skill slots per agent column. Untouched columns auto-detect the first
 * installed candidate for each slot (`d-name`, then `name`); column settings can
 * override with an explicit list. Prompt tokens are resolved at stage start.
 */
export const STAGE_SKILLS: Record<AgentStage, readonly string[]> = {
  grill: ["d-plan", "d-grill-me", "d-analyze"],
  implement: ["d-tdd", "d-verify", "d-lean-code"],
  code_review: ["d-code-review", "d-security-review", "d-merge-request-writer"],
  rework: ["d-tdd", "d-verify", "d-lean-code"],
};
