import { describe, expect, it } from "vitest";
import type { ArtifactDoc, ArtifactKind } from "../../types/artifact";
import type { AgentStage } from "../../types/stage";
import { stageInputs } from "./inputs";
import type { PromptCard, StagePromptContext } from "./shared";
import { buildStagePrompt } from "./stages";

const card: PromptCard = {
  number: 7,
  title: "Add board",
  projectCwd: "/code/app",
  worktreePath: "/code/app-worktrees/task-7",
  branch: "molfar/task-abc123-add-board",
  baseSha: "a".repeat(40),
  grillRound: 1,
  reworkCycle: 0,
};

const KINDS: ArtifactKind[] = ["task", "spec", "plan", "questions", "answers", "impl_report", "review", "rework_brief"];

function context(overrides: Partial<PromptCard> = {}): StagePromptContext {
  const inputs: Partial<Record<ArtifactKind, ArtifactDoc>> = {};
  for (const kind of KINDS) inputs[kind] = { kind, version: 2, body: `BODY-${kind}` };
  return { card: { ...card, ...overrides }, inputs, headSha: "b".repeat(40) };
}

const included = (prompt: string) => KINDS.filter((kind) => prompt.includes(`BODY-${kind}`));

describe("buildStagePrompt", () => {
  it.each<[AgentStage, Partial<PromptCard>, ArtifactKind[]]>([
    ["grill", {}, ["task"]],
    ["grill", { grillRound: 2 }, ["task", "spec", "plan", "questions", "answers"]],
    ["implement", {}, ["task", "spec", "plan"]],
    ["code_review", {}, ["task", "spec", "plan", "impl_report"]],
    ["rework", {}, ["task", "spec", "plan", "impl_report", "review", "rework_brief"]],
  ])("%s %o inlines exactly its inputs", (stage, overrides, kinds) => {
    expect(included(buildStagePrompt(stage, context(overrides))).sort()).toEqual([...kinds].sort());
  });

  it("marks read-only stages and asks writing stages to commit", () => {
    expect(buildStagePrompt("grill", context())).toContain("READ-ONLY stage");
    expect(buildStagePrompt("code_review", context())).toContain("READ-ONLY stage");
    expect(buildStagePrompt("implement", context())).toContain("at least one new commit");
    expect(buildStagePrompt("rework", context())).not.toContain("READ-ONLY");
  });

  it.each<AgentStage>(["grill", "implement", "code_review", "rework"])(
    "%s forbids attribution and names no person",
    (stage) => {
      const prompt = buildStagePrompt(stage, context());
      expect(prompt).toContain("Never add AI or tool attribution");
      expect(prompt).not.toMatch(/erik/i);
    },
  );

  it("states the output contract with markers", () => {
    const grill = buildStagePrompt("grill", context());
    expect(grill).toContain("<<<MOLFAR:spec>>>");
    expect(grill).toContain("<<<END:plan>>>");
    expect(buildStagePrompt("code_review", context())).toContain(`${"a".repeat(40)}...${"b".repeat(40)}`);
  });
});

describe("stageInputs", () => {
  it("makes questions optional after a note-only round", () => {
    expect(stageInputs("grill", 3).optional).toEqual(["questions"]);
  });
});
