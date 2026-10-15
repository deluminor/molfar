import type { ArtifactDoc, ArtifactKind } from "../../types/artifact";
import type { Card } from "../../types/card";
import { STAGE_SKILLS } from "../../constants/skills";
import type { AgentStage } from "../../types/stage";
import { closeMarker, openMarker } from "../artifacts/markers";

/** Recorded on every stage run; bump when a template's contract changes. */
export const TEMPLATE_VERSION = 2;

export type PromptCard = Pick<
  Card,
  "number" | "title" | "projectCwd" | "worktreePath" | "branch" | "baseSha" | "grillRound" | "reworkCycle"
>;

export type StagePromptContext = {
  card: PromptCard;
  inputs: Partial<Record<ArtifactKind, ArtifactDoc>>;
  headSha?: string;
};

const INPUT_TITLE: Record<ArtifactKind, string> = {
  task: "Task",
  spec: "Spec",
  plan: "Plan",
  questions: "Previous questions",
  answers: "Answers and notes from the user",
  impl_report: "Latest implementation report",
  review: "Latest code review",
  rework_brief: "Findings selected for rework",
  delivery: "Delivery",
  pr_description: "Pull request description",
};

export function header(context: StagePromptContext, role: string): string {
  const { card } = context;
  return [
    `You are the ${role} stage of MOLFAR Task Board card #${card.number}: "${card.title}".`,
    "This is a fresh session. Everything you know about the task is in this prompt and in the repository.",
    "",
    `- Project: ${card.projectCwd}`,
    `- Working checkout (your cwd): ${card.worktreePath ?? "(not created)"}`,
    `- Branch: ${card.branch ?? "(none)"}`,
    `- Base commit: ${card.baseSha ?? "(unknown)"}`,
  ].join("\n");
}

/**
 * Skill tokens on their own line, so MOLFAR recognises every one of them. The
 * skills were written for interactive chats; the stage contract wins.
 */
export function skills(stage: AgentStage): string {
  return [
    "## Skills",
    STAGE_SKILLS[stage].map((name) => `/${name}`).join(" "),
    "",
    "Apply every skill above. They were written for interactive work, so in this stage: do not stop to wait for",
    "approval or ask questions in chat (open questions go in the questions block), do not hand git commands to the",
    "user instead of acting (writing stages commit themselves), and the Output contract below wins over any skill's",
    "own output format.",
  ].join("\n");
}

export function rules(readOnly: boolean): string {
  const shared = [
    "- Work only inside the working checkout. Never push, never open pull requests, never switch branches.",
    "- Never add AI or tool attribution anywhere: no Co-authored-by, Generated-by or similar lines.",
    "- Do not mention any person by name in the artifacts you write; say \"the user\".",
  ];
  const mode = readOnly
    ? [
        "- READ-ONLY stage: do not create, modify, stage or commit any file. MOLFAR compares the checkout before and after;",
        "  any change fails this stage.",
      ]
    : [
        "- Commit your work yourself with small, atomic Conventional Commits (`type(scope): subject`).",
        "- Finish with a clean working tree and at least one new commit, or this stage fails.",
      ];
  return ["## Rules", ...shared, ...mode].join("\n");
}

export function renderInputs(context: StagePromptContext, kinds: readonly ArtifactKind[]): string {
  const sections = kinds.flatMap((kind) => {
    const doc = context.inputs[kind];
    if (!doc) return [];
    return [`### ${INPUT_TITLE[kind]} (v${doc.version})\n\n${doc.body.trim()}`];
  });
  return ["## Inputs", ...sections].join("\n\n");
}

export function outputContract(kinds: readonly { kind: ArtifactKind; format: string }[]): string {
  const blocks = kinds.map(
    ({ kind, format }) => `${openMarker(kind)}\n${format}\n${closeMarker(kind)}`,
  );
  return [
    "## Output",
    "End your final message with these blocks, exactly as delimited. MOLFAR saves them as files; anything outside",
    "the blocks is ignored. Each block must be complete Markdown on its own.",
    "",
    ...blocks,
  ].join("\n");
}
