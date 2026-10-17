import type { ArtifactDoc, ArtifactKind } from "../../types/artifact";
import type { AgentStage } from "../../types/stage";

type InputContract = { required: ArtifactKind[]; optional: ArtifactKind[] };

const FIRST_GRILL: InputContract = { required: ["task"], optional: [] };
const LATER_GRILL: InputContract = {
  required: ["task", "spec", "plan", "answers"],
  optional: ["questions"],
};

/** Which artifacts each stage receives as handoff files (latest versions). */
export function stageInputs(stage: AgentStage, grillRound: number): InputContract {
  switch (stage) {
    case "grill":
      return grillRound <= 1 ? FIRST_GRILL : LATER_GRILL;
    case "implement":
      return { required: ["task", "spec", "plan"], optional: [] };
    case "code_review":
      return { required: ["task", "spec", "plan", "impl_report"], optional: [] };
    case "rework":
      return {
        required: ["task", "spec", "plan", "review", "rework_brief"],
        optional: ["impl_report"],
      };
  }
}

/**
 * Later grill rounds need prior artifacts. If they are gone (e.g. round was
 * bumped by a backlog re-start before this was fixed), fall back to first-grill.
 */
export function resolveGrillInputs(
  grillRound: number,
  available: Partial<Record<ArtifactKind, ArtifactDoc | undefined>>,
): InputContract {
  if (grillRound <= 1) return FIRST_GRILL;
  const missing = LATER_GRILL.required.filter((kind) => !available[kind]);
  return missing.length === 0 ? LATER_GRILL : FIRST_GRILL;
}
