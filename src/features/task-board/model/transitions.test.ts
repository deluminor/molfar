import { describe, expect, it } from "vitest";
import type { BoardColumn, RunState } from "../types/card";
import { legalDropTargets, transition, type BoardActionType } from "./transitions";

const at = (columnId: BoardColumn, runState: RunState = "idle", archived = false) => ({
  columnId,
  runState,
  archived,
});

function next(column: BoardColumn, state: RunState, action: BoardActionType) {
  const result = transition(at(column, state), action);
  if (!result.ok) return result.reason;
  return `${result.columnId}/${result.runState}${result.archived ? "/archived" : ""}`;
}

describe("transition", () => {
  it.each<[BoardColumn, RunState, BoardActionType, string]>([
    ["backlog", "idle", "start", "grill/queued"],
    ["grill", "running", "stageSucceeded", "plan_approval/idle"],
    ["plan_approval", "idle", "answer", "grill/queued"],
    ["plan_approval", "idle", "requestChanges", "grill/queued"],
    ["plan_approval", "idle", "approvePlan", "implement/queued"],
    ["plan_approval", "idle", "editPlan", "plan_approval/idle"],
    ["backlog", "idle", "editTask", "backlog/idle"],
    ["plan_approval", "idle", "editTask", "plan_approval/idle"],
    ["implement", "running", "stageSucceeded", "code_review/queued"],
    ["rework", "running", "stageSucceeded", "code_review/queued"],
    ["code_review", "running", "stageSucceeded", "final_review/idle"],
    ["final_review", "idle", "rework", "rework/queued"],
    ["final_review", "idle", "deliverStart", "final_review/running"],
    ["final_review", "failed", "deliverStart", "final_review/running"],
    ["final_review", "running", "deliver", "done/idle"],
    ["final_review", "running", "deliveryFailed", "final_review/failed"],
    ["implement", "running", "stageFailed", "implement/failed"],
    ["implement", "failed", "retry", "implement/queued"],
    ["grill", "failed", "back", "backlog/idle"],
    ["implement", "failed", "back", "plan_approval/idle"],
    ["code_review", "failed", "back", "final_review/idle"],
    ["rework", "failed", "back", "final_review/idle"],
    ["grill", "running", "cancel", "grill/failed"],
    ["implement", "queued", "cancel", "implement/failed"],
    ["final_review", "idle", "reject", "final_review/idle/archived"],
    ["backlog", "idle", "reject", "backlog/idle/archived"],
    ["done", "idle", "reject", "done/idle/archived"],
  ])("%s/%s + %s → %s", (column, state, action, expected) => {
    expect(next(column, state, action)).toBe(expected);
  });

  it.each<[BoardColumn, RunState, BoardActionType]>([
    ["backlog", "idle", "approvePlan"],
    ["grill", "running", "start"],
    ["grill", "queued", "stageSucceeded"],
    ["implement", "running", "retry"],
    ["implement", "idle", "back"],
    ["plan_approval", "idle", "deliver"],
    ["final_review", "idle", "deliver"],
    ["final_review", "running", "deliverStart"],
    ["final_review", "idle", "editTask"],
    ["implement", "running", "reject"],
    ["done", "idle", "start"],
  ])("refuses %s/%s + %s", (column, state, action) => {
    expect(transition(at(column, state), action).ok).toBe(false);
  });

  it("archives a done card without cleanup side effects", () => {
    const result = transition(at("done"), "reject");
    expect(result.ok && result.effects).toEqual([]);
    expect(result.ok && result.archived).toBe(true);
  });

  it("refuses everything on an archived card", () => {
    expect(transition(at("backlog", "idle", true), "start").ok).toBe(false);
  });

  it("names the side effects the caller must run", () => {
    const start = transition(at("backlog"), "start");
    const cancel = transition(at("grill", "running"), "cancel");
    const deliver = transition(at("final_review", "running"), "deliver");

    expect(start.ok && start.effects).toEqual(["ensureWorktree", "resetGrillRound"]);
    expect(cancel.ok && cancel.effects).toEqual(["stopSession"]);
    expect(deliver.ok && deliver.effects).toContain("cleanupWorktree");
  });

  it("increments the grill round only when returning from plan approval", () => {
    const changes = transition(at("plan_approval"), "requestChanges");
    expect(changes.ok && changes.effects).toContain("nextGrillRound");
    expect(changes.ok && changes.effects).not.toContain("resetGrillRound");
  });
});

describe("legalDropTargets", () => {
  const columns = (column: BoardColumn, state: RunState = "idle") =>
    legalDropTargets(at(column, state)).map((target) => `${target.column}:${target.action}:${target.needsInput}`);

  it("offers only moves the state machine allows", () => {
    expect(columns("backlog")).toEqual(["grill:start:false"]);
    expect(columns("plan_approval")).toEqual(["implement:approvePlan:false", "grill:requestChanges:true"]);
    expect(columns("final_review")).toEqual(["rework:rework:true", "done:deliver:true"]);
    expect(columns("implement", "failed")).toEqual(["plan_approval:back:false"]);
  });

  it("offers nothing while a stage runs or after delivery", () => {
    expect(columns("implement", "running")).toEqual([]);
    expect(columns("done")).toEqual([]);
  });
});
