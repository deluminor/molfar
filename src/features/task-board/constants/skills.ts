import type { AgentStage } from "../types/stage";

/**
 * Hub skills each stage invokes. The prompt names them as `/skill` tokens, so
 * MOLFAR inlines their bodies for every harness (or the harness runs them).
 */
export const STAGE_SKILLS: Record<AgentStage, readonly string[]> = {
  grill: ["d-plan", "d-grill-me", "d-analyze"],
  implement: ["d-tdd", "d-verify", "d-lean-code"],
  code_review: ["d-code-review", "d-security-review", "d-merge-request-writer"],
  rework: ["d-tdd", "d-verify", "d-lean-code"],
};
