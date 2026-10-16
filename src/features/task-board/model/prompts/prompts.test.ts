import { describe, expect, it } from "vitest";
import type { ArtifactKind } from "../../types/artifact";
import type { AgentStage } from "../../types/stage";
import { stageInputs } from "./inputs";
import type { PromptCard, StagePromptContext } from "./shared";
import { skillNamesInText } from "../../../skills/model/skills";
import { STAGE_SKILLS } from "../../constants/skills";
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

function context(overrides: Partial<PromptCard> = {}, kinds: readonly ArtifactKind[] = KINDS): StagePromptContext {
  const files = kinds.map((kind) => ({ kind, version: 2, path: `.molfar/board/${kind}-v2.md` }));
  return { card: { ...card, ...overrides }, files, headSha: "b".repeat(40) };
}

const listed = (prompt: string) => KINDS.filter((kind) => prompt.includes(`\`.molfar/board/${kind}-v2.md\``));

describe("buildStagePrompt", () => {
  it.each<[AgentStage, Partial<PromptCard>, ArtifactKind[]]>([
    ["grill", {}, ["task"]],
    ["grill", { grillRound: 2 }, ["task", "spec", "plan", "questions", "answers"]],
    ["implement", {}, ["task", "spec", "plan"]],
    ["code_review", {}, ["task", "spec", "plan", "impl_report"]],
    ["rework", {}, ["task", "spec", "plan", "impl_report", "review", "rework_brief"]],
  ])("%s %o lists its handoff files", (stage, overrides, kinds) => {
    const contract = stageInputs(stage, overrides.grillRound ?? 1);
    expect([...contract.required, ...contract.optional].sort()).toEqual([...kinds].sort());
    expect(listed(buildStagePrompt(stage, context(overrides, kinds))).sort()).toEqual([...kinds].sort());
  });

  it("describes each handoff file by kind and version instead of inlining bodies", () => {
    const prompt = buildStagePrompt("implement", context({}, ["task", "spec", "plan"]));

    expect(prompt).toContain("## Handoff files");
    expect(prompt).toContain("| `.molfar/board/plan-v2.md` | plan | v2 | The implementation plan |");
    expect(prompt).not.toContain("## Inputs");
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

  it.each<AgentStage>(["grill", "implement", "code_review", "rework"])(
    "%s invokes exactly its hub skills as recognised /skill tokens",
    (stage) => {
      const named = skillNamesInText(buildStagePrompt(stage, context())).filter((name) => name.startsWith("d-"));
      expect(named).toEqual([...STAGE_SKILLS[stage]]);
    },
  );

  it("asks code review for a pull request description", () => {
    expect(buildStagePrompt("code_review", context())).toContain("<<<MOLFAR:pr_description>>>");
  });

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
