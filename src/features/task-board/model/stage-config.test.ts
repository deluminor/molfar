import { describe, expect, it } from "vitest";
import type { StageModelConfig } from "../types/stage";
import { taskBranchName } from "./branch-name";
import { mergeStageConfig, parseOverrides } from "./stage-config";

const column: StageModelConfig = {
  harness: "claude",
  model: "claude:opus",
  effort: "high",
  runtimeMode: "auto",
};

describe("parseOverrides", () => {
  it("keeps known stages and valid fields only", () => {
    const json = JSON.stringify({
      grill: { model: "claude:sonnet", runtimeMode: "nope", extra: 1 },
      deploy: { harness: "codex" },
      implement: "codex",
    });
    expect(parseOverrides(json)).toEqual({ grill: { model: "claude:sonnet" } });
  });

  it("treats malformed JSON as no overrides", () => {
    expect(parseOverrides("{")).toEqual({});
    expect(parseOverrides("null")).toEqual({});
  });
});

describe("mergeStageConfig", () => {
  it("lets the card override fields one by one", () => {
    expect(mergeStageConfig(column, { effort: "low" })).toEqual({ ...column, effort: "low" });
  });

  it("drops the column's model and effort when the card switches provider", () => {
    expect(mergeStageConfig(column, { harness: "codex" })).toEqual({ harness: "codex", runtimeMode: "auto" });
  });

  it("falls back to nothing when neither is set, so project defaults apply", () => {
    expect(mergeStageConfig(undefined, undefined)).toEqual({});
  });
});

describe("taskBranchName", () => {
  it("builds a stable molfar/task branch from id and title", () => {
    expect(taskBranchName("3f9a2c1d-77", "Add Task Board: kanban!")).toBe("molfar/task-3f9a2c-add-task-board-kanban");
  });

  it("caps the slug and survives titles with no latin characters", () => {
    expect(taskBranchName("abcdef12", "x".repeat(80))).toBe(`molfar/task-abcdef-${"x".repeat(40)}`);
    expect(taskBranchName("abcdef12", "Дошка задач")).toBe("molfar/task-abcdef");
  });
});
