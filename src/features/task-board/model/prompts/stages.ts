import { READ_ONLY_STAGES } from "../../constants/columns";
import type { AgentStage } from "../../types/stage";
import { stageInputs } from "./inputs";
import {
  header,
  outputContract,
  renderInputs,
  rules,
  type StagePromptContext,
} from "./shared";

const SPEC_FORMAT = [
  "---",
  'pr_title: "<conventional commit title for the eventual pull request>"',
  "---",
  "# Spec — problem, done / acceptance criteria, scope and out of scope, constraints, risks",
].join("\n");
const PLAN_FORMAT =
  "# Plan — Goal, Technical Approach, Architecture Overview, Risks & Mitigations, Execution Stages, Testing Strategy";
const QUESTIONS_FORMAT = [
  "## Q1 — <decision title>",
  "<the question, with concrete options>",
  "**Recommended:** <your recommended answer>",
].join("\n");
const IMPL_REPORT_FORMAT = [
  "# Implementation report",
  "## Summary",
  "## Commits (sha — subject)",
  "## Checks run and results (lint, typecheck, tests)",
  "## Deviations from the plan",
  "## Follow-ups",
].join("\n");
const REVIEW_FORMAT = [
  "Verdict: APPROVE | CHANGES_REQUESTED",
  "",
  "## F1 [blocking|major|minor|nit] <finding title>",
  "File: <path>:<line>",
  "<what is wrong, why it matters, how to fix>",
].join("\n");

function grill(context: StagePromptContext): string[] {
  const later = context.card.grillRound > 1;
  return [
    "## Goal",
    later
      ? `Grill round ${context.card.grillRound}. Fold the user's answers and notes into the spec and plan. Do not re-ask settled questions.`
      : "Analyze the repository and turn the task into a spec and an implementation plan.",
    "",
    "Work the open decisions as a design tree: settle everything the code can answer yourself, and ask only what",
    "the user must decide. Always produce a complete draft spec and plan, even when questions remain: the user may",
    "approve the plan without answering. Emit the questions block only when a decision is genuinely open.",
    "",
    outputContract([
      { kind: "spec", format: SPEC_FORMAT },
      { kind: "plan", format: PLAN_FORMAT },
      { kind: "questions", format: `${QUESTIONS_FORMAT}\n(omit this whole block when nothing is open)` },
    ]),
  ];
}

function implement(): string[] {
  return [
    "## Goal",
    "Implement the approved plan, stage by stage. Write tests first where practical, keep each stage working, and run",
    "the lint, typecheck and test commands the plan or the repository defines before you finish.",
    "",
    outputContract([{ kind: "impl_report", format: IMPL_REPORT_FORMAT }]),
  ];
}

function codeReview(context: StagePromptContext): string[] {
  const head = context.headSha ?? "HEAD";
  return [
    "## Goal",
    `Review the change \`git diff ${context.card.baseSha ?? "<base>"}...${head}\` against the spec, its acceptance`,
    "criteria and the plan. Inspect the diff and any surrounding code yourself. Look for correctness bugs, missing",
    "tests, security issues, broken contracts and deviations from the plan. Anchor every finding to file:line.",
    "Use APPROVE only when nothing blocking or major remains.",
    "",
    outputContract([{ kind: "review", format: REVIEW_FORMAT }]),
  ];
}

function rework(): string[] {
  return [
    "## Goal",
    "Address exactly the findings selected for rework and the user's note. Leave unselected findings alone unless",
    "fixing a selected one requires it. Re-run the checks before you finish.",
    "",
    outputContract([
      { kind: "impl_report", format: `${IMPL_REPORT_FORMAT}\n## Resolution of each selected finding` },
    ]),
  ];
}

const ROLE: Record<AgentStage, string> = {
  grill: "Grill (analysis and planning)",
  implement: "Implement",
  code_review: "Code review",
  rework: "Rework",
};

export function buildStagePrompt(stage: AgentStage, context: StagePromptContext): string {
  const contract = stageInputs(stage, context.card.grillRound);
  const body: Record<AgentStage, () => string[]> = {
    grill: () => grill(context),
    implement,
    code_review: () => codeReview(context),
    rework,
  };

  return [
    header(context, ROLE[stage]),
    rules(READ_ONLY_STAGES.includes(stage)),
    renderInputs(context, [...contract.required, ...contract.optional]),
    ...body[stage](),
  ].join("\n\n");
}
