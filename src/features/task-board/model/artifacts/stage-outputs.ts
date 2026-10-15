import type { ArtifactKind } from "../../types/artifact";
import type { AgentStage } from "../../types/stage";
import { extractArtifacts } from "./markers";
import { parseQuestions } from "./questions";
import { parseReview } from "./review";

type OutputContract = { required: ArtifactKind[]; optional: ArtifactKind[] };

export const STAGE_OUTPUTS: Record<AgentStage, OutputContract> = {
  grill: { required: ["spec", "plan"], optional: ["questions"] },
  implement: { required: ["impl_report"], optional: [] },
  code_review: { required: ["review"], optional: ["pr_description"] },
  rework: { required: ["impl_report"], optional: [] },
};

export type StageOutput =
  | { ok: true; artifacts: { kind: ArtifactKind; body: string }[] }
  | { ok: false; error: string };

function formatError(kind: ArtifactKind, body: string): string | undefined {
  if (kind === "review") {
    const review = parseReview(body);
    return review.ok ? undefined : review.error;
  }
  if (kind === "questions" && parseQuestions(body).length === 0)
    return "Questions must use `## Q<n> — <title>` headings.";
  return undefined;
}

/** Turns a stage's final text into the artifacts it owes, or a clear refusal. */
export function readStageOutput(stage: AgentStage, text: string): StageOutput {
  const contract = STAGE_OUTPUTS[stage];
  const required = extractArtifacts(text, contract.required);
  if (required.missing.length) {
    const names = required.missing.join(", ");
    return { ok: false, error: `The stage did not return: ${names}.` };
  }

  const optional = extractArtifacts(text, contract.optional);
  const found = { ...required.found, ...optional.found };
  const artifacts: { kind: ArtifactKind; body: string }[] = [];
  for (const kind of [...contract.required, ...contract.optional]) {
    const body = found[kind];
    if (!body) continue;
    const error = formatError(kind, body);
    if (error) return { ok: false, error: `${kind}: ${error}` };
    artifacts.push({ kind, body });
  }

  return { ok: true, artifacts };
}
