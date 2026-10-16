import type { ArtifactKind } from "../../types/artifact";
import type { AgentStage } from "../../types/stage";

type InputContract = { required: ArtifactKind[]; optional: ArtifactKind[] };

/** Which artifacts each stage receives as handoff files (latest versions). */
export function stageInputs(stage: AgentStage, grillRound: number): InputContract {
  switch (stage) {
    case "grill":
      return grillRound <= 1
        ? { required: ["task"], optional: [] }
        : { required: ["task", "spec", "plan", "answers"], optional: ["questions"] };
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
