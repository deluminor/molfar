import { isAgentStage } from "../constants/columns";
import type { BoardColumn, Card, RunState } from "../types/card";
import type { AgentStage } from "../types/stage";

export type BoardActionType =
  | "start"
  | "stageSucceeded"
  | "stageFailed"
  | "answer"
  | "requestChanges"
  | "approvePlan"
  | "editPlan"
  | "editTask"
  | "rework"
  | "deliverStart"
  | "deliver"
  | "deliveryFailed"
  | "retry"
  | "back"
  | "cancel"
  | "reject";

export type TransitionEffect =
  | "ensureWorktree"
  | "nextGrillRound"
  | "nextReworkCycle"
  | "stopSession"
  | "cleanupWorktree"
  | "clearError";

export type CardPosition = Pick<Card, "columnId" | "runState" | "archived">;

export type Transition =
  | {
      ok: true;
      columnId: BoardColumn;
      runState: RunState;
      archived: boolean;
      effects: TransitionEffect[];
    }
  | { ok: false; reason: string };

export type DropTarget = {
  column: BoardColumn;
  action: BoardActionType;
  /** The move needs answers, findings or a delivery method before it can run. */
  needsInput: boolean;
};

const BACK_TARGET: Record<AgentStage, BoardColumn> = {
  grill: "backlog",
  implement: "plan_approval",
  code_review: "final_review",
  rework: "final_review",
};

const AFTER_SUCCESS: Record<AgentStage, { column: BoardColumn; runState: RunState }> = {
  grill: { column: "plan_approval", runState: "idle" },
  implement: { column: "code_review", runState: "queued" },
  code_review: { column: "final_review", runState: "idle" },
  rework: { column: "code_review", runState: "queued" },
};

function move(
  columnId: BoardColumn,
  runState: RunState,
  effects: TransitionEffect[] = [],
  archived = false,
): Transition {
  return { ok: true, columnId, runState, archived, effects };
}

function refuse(action: BoardActionType, card: CardPosition): Transition {
  return {
    ok: false,
    reason: `Cannot ${action} a card in ${card.columnId} (${card.runState}).`,
  };
}

export function backTarget(stage: AgentStage): BoardColumn {
  return BACK_TARGET[stage];
}

function agentTransition(card: CardPosition, action: BoardActionType): Transition | null {
  const column = card.columnId;
  if (!isAgentStage(column)) return null;
  const state = card.runState;

  if (action === "stageSucceeded" && state === "running") {
    const next = AFTER_SUCCESS[column];
    return move(next.column, next.runState, ["clearError"]);
  }
  if (action === "stageFailed" && state === "running") return move(column, "failed");
  if (action === "retry" && state === "failed") return move(column, "queued", ["clearError"]);
  if (action === "back" && state === "failed")
    return move(BACK_TARGET[column], "idle", ["clearError"]);
  if (action === "cancel" && state === "running") return move(column, "failed", ["stopSession"]);
  if (action === "cancel" && state === "queued") return move(column, "failed");
  return null;
}

function gateTransition(card: CardPosition, action: BoardActionType): Transition | null {
  const { columnId: column, runState: state } = card;
  const idle = state === "idle";

  if (column === "backlog" && idle && action === "start")
    return move("grill", "queued", ["ensureWorktree", "nextGrillRound"]);
  if (action === "editTask" && idle && (column === "backlog" || column === "plan_approval"))
    return move(column, "idle");

  if (column === "plan_approval" && idle) {
    if (action === "answer" || action === "requestChanges")
      return move("grill", "queued", ["nextGrillRound"]);
    if (action === "approvePlan") return move("implement", "queued");
    if (action === "editPlan") return move(column, "idle");
  }

  const reviewable = state === "idle" || state === "failed";
  if (column === "final_review" && reviewable) {
    if (action === "rework") return move("rework", "queued", ["nextReworkCycle", "clearError"]);
    // Delivery holds the card in `running` so a second deliver (another window, a phone) is refused.
    if (action === "deliverStart") return move(column, "running", ["clearError"]);
  }
  if (column === "final_review" && state === "running") {
    if (action === "deliver") return move("done", "idle", ["cleanupWorktree", "clearError"]);
    if (action === "deliveryFailed") return move(column, "failed");
  }
  return null;
}

/** The single source of truth for what a card may do next. Pure. */
export function transition(card: CardPosition, action: BoardActionType): Transition {
  if (card.archived) return { ok: false, reason: "The card is archived." };

  if (action === "reject") {
    const finished = card.columnId === "done";
    const busy = card.runState === "running";
    if (finished || busy) return refuse(action, card);
    return move(card.columnId, "idle", ["cleanupWorktree"], true);
  }

  return agentTransition(card, action) ?? gateTransition(card, action) ?? refuse(action, card);
}

/** `probe` is the transition that decides whether the move is legal right now. */
const CANDIDATES: readonly { action: BoardActionType; probe?: BoardActionType; needsInput: boolean }[] = [
  { action: "start", needsInput: false },
  { action: "approvePlan", needsInput: false },
  { action: "requestChanges", needsInput: true },
  { action: "rework", needsInput: true },
  { action: "deliver", probe: "deliverStart", needsInput: true },
  { action: "back", needsInput: false },
];

/** Columns a card can be dragged to, each with the action the drop performs. */
export function legalDropTargets(card: CardPosition): DropTarget[] {
  const targets: DropTarget[] = [];
  for (const { action, probe, needsInput } of CANDIDATES) {
    const result = transition(card, probe ?? action);
    if (!result.ok) continue;
    const column = action === "deliver" ? "done" : result.columnId;
    if (column === card.columnId) continue;
    targets.push({ column, action, needsInput });
  }
  return targets;
}
