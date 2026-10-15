import { MANUAL_GATES } from "../constants/columns";
import type { Card } from "../types/card";
import type { StageRun } from "../types/stage";

const MINUTE_MS = 60_000;

export function isStalled(run: Pick<StageRun, "status" | "startedAt">, now: number, stallMinutes: number): boolean {
  return run.status === "running" && now - run.startedAt >= stallMinutes * MINUTE_MS;
}

/** A card waits on the user at a gate, after a failure, or on a pending approval/question. */
export function needsYou(card: Pick<Card, "columnId" | "runState" | "archived">, sessionNeedsInput: boolean): boolean {
  if (card.archived) return false;
  if (card.runState === "failed") return true;
  if (MANUAL_GATES.includes(card.columnId) && card.runState === "idle") return true;
  return card.runState === "running" && sessionNeedsInput;
}
