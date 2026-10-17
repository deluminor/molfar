import { describe, expect, it } from "vitest";
import type { ArtifactDoc, ArtifactKind } from "../../types/artifact";
import type { AgentStage } from "../../types/stage";
import { resolveGrillInputs, stageInputs } from "./inputs";
import type { PromptCard, StagePromptContext } from "./shared";
import { skillNamesInText } from "../../../skills/model/skills";
import { STAGE_SKILLS } from "../../constants/skills";
import { buildStagePrompt } from "./stages";

const defaultSkills = (stage: AgentStage) => [...STAGE_SKILLS[stage]];

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
    expect(listed(buildStagePrompt(stage, context(overrides, kinds), defaultSkills(stage))).sort()).toEqual(
      [...kinds].sort(),
    );
  });

  it("describes each handoff file by kind and version instead of inlining bodies", () => {
    const prompt = buildStagePrompt("implement", context({}, ["task", "spec", "plan"]), defaultSkills("implement"));

    expect(prompt).toContain("## Handoff files");
    expect(prompt).toContain("| `.molfar/board/plan-v2.md` | plan | v2 | The implementation plan |");
    expect(prompt).not.toContain("## Inputs");
  });

  it("marks read-only stages and asks writing stages to commit", () => {
    expect(buildStagePrompt("grill", context(), defaultSkills("grill"))).toContain("READ-ONLY stage");
    expect(buildStagePrompt("code_review", context(), defaultSkills("code_review"))).toContain("READ-ONLY stage");
    expect(buildStagePrompt("implement", context(), defaultSkills("implement"))).toContain("at least one new commit");
    expect(buildStagePrompt("rework", context(), defaultSkills("rework"))).not.toContain("READ-ONLY");
  });

  it.each<AgentStage>(["grill", "implement", "code_review", "rework"])(
    "%s forbids attribution and names no person",
    (stage) => {
      const prompt = buildStagePrompt(stage, context(), defaultSkills(stage));
      expect(prompt).toContain("Never add AI or tool attribution");
      expect(prompt).not.toMatch(/erik/i);
    },
  );

  it.each<AgentStage>(["grill", "implement", "code_review", "rework"])(
    "%s invokes exactly the skill names passed in as /skill tokens",
    (stage) => {
      const named = skillNamesInText(buildStagePrompt(stage, context(), defaultSkills(stage)));
      expect(named).toEqual(defaultSkills(stage));
    },
  );

  it("omits the Skills section when no skills resolve", () => {
    expect(buildStagePrompt("code_review", context(), [])).not.toContain("## Skills");
  });

  it("asks code review for a pull request description", () => {
    expect(buildStagePrompt("code_review", context(), defaultSkills("code_review"))).toContain(
      "<<<MOLFAR:pr_description>>>",
    );
  });

  it("states the output contract with markers", () => {
    const grill = buildStagePrompt("grill", context(), defaultSkills("grill"));
    expect(grill).toContain("<<<MOLFAR:spec>>>");
    expect(grill).toContain("<<<END:plan>>>");
    expect(buildStagePrompt("code_review", context(), defaultSkills("code_review"))).toContain(
      `${"a".repeat(40)}...${"b".repeat(40)}`,
    );
  });
});

describe("stageInputs", () => {
  it("makes questions optional after a note-only round", () => {
    expect(stageInputs("grill", 3).optional).toEqual(["questions"]);
  });
});

describe("resolveGrillInputs", () => {
  const doc = (kind: ArtifactKind): ArtifactDoc => ({ kind, version: 1, body: kind });

  it("keeps the later-grill contract when every required artifact exists", () => {
    const available = {
      task: doc("task"),
      spec: doc("spec"),
      plan: doc("plan"),
      answers: doc("answers"),
    };
    expect(resolveGrillInputs(2, available)).toEqual(stageInputs("grill", 2));
  });

  it("falls back to first-grill when later-round artifacts are missing", () => {
    expect(resolveGrillInputs(2, { task: doc("task") })).toEqual(stageInputs("grill", 1));
  });
});
