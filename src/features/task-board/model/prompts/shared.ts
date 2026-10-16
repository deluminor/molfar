import type { ArtifactKind, HandoffFile } from "../../types/artifact";
import type { Card } from "../../types/card";
import { STAGE_SKILLS } from "../../constants/skills";
import type { AgentStage } from "../../types/stage";
import { closeMarker, openMarker } from "../artifacts/markers";

/** Recorded on every stage run; bump when a template's contract changes. */
export const TEMPLATE_VERSION = 3;

export type PromptCard = Pick<
  Card,
  "number" | "title" | "projectCwd" | "worktreePath" | "branch" | "baseSha" | "grillRound" | "reworkCycle"
>;

export type StagePromptContext = {
  card: PromptCard;
  /** The stage's inputs, already copied into the checkout, in contract order. */
  files: readonly HandoffFile[];
  headSha?: string;
};

const INPUT_TITLE: Record<ArtifactKind, string> = {
  task: "The task as the user wrote it, with acceptance criteria",
  spec: "Spec: problem, acceptance criteria, scope, constraints, risks",
  plan: "The implementation plan",
  questions: "Questions the previous grill round asked",
  answers: "The user's answers and notes",
  impl_report: "The latest implementation report",
  review: "The latest code review and its findings",
  rework_brief: "The findings selected for rework, with the user's note",
  delivery: "Delivery record",
  pr_description: "Pull request description",
};

export function header(context: StagePromptContext, role: string): string {
  const { card } = context;
  return [
    `You are the ${role} stage of MOLFAR Task Board card #${card.number}: "${card.title}".`,
    "This is a fresh session. Everything you know about the task is in this prompt, the handoff files it lists and",
    "the repository.",
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
        "  any change fails this stage. The git-ignored handoff folder `.molfar/board/` belongs to MOLFAR; leave it as is.",
      ]
    : [
        "- Commit your work yourself with small, atomic Conventional Commits (`type(scope): subject`).",
        "- Finish with a clean working tree and at least one new commit, or this stage fails.",
      ];
  return ["## Rules", ...shared, ...mode].join("\n");
}

/** A manifest of the handoff files; their bodies stay in the files. */
export function renderInputs(files: readonly HandoffFile[]): string {
  const rows = files.map((file) => `| \`${file.path}\` | ${file.kind} | v${file.version} | ${INPUT_TITLE[file.kind]} |`);
  return [
    "## Handoff files",
    "Read every file below before you start; together they are the card's current state. MOLFAR copied them from",
    "the card into your checkout. They are git-ignored, not part of the repository: never edit, stage or commit them.",
    "",
    "| File | Kind | Version | What it is |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
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
