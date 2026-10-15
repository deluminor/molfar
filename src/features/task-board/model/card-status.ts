import { MANUAL_GATES } from "../constants/columns";
import type { Card } from "../types/card";
import type { StageRun } from "../types/stage";
import { isStalled } from "./attention";

export type CardStatusKind = "queued" | "running" | "stalled" | "needs_you" | "failed" | "delivered";

export type CardStatus = { kind: CardStatusKind; label: string } | null;

export function elapsedLabel(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** The single chip a card shows; always a word, never colour alone. */
export function cardStatus(
  card: Pick<Card, "columnId" | "runState">,
  run: Pick<StageRun, "status" | "startedAt"> | undefined,
  context: { now: number; stallMinutes: number; needsInput: boolean },
): CardStatus {
  if (card.runState === "failed") return { kind: "failed", label: "Failed" };
  if (card.runState === "queued") return { kind: "queued", label: "Queued" };

  if (card.runState === "running" && card.columnId === "final_review") return { kind: "running", label: "Delivering" };
  if (card.runState === "running") {
    if (context.needsInput) return { kind: "needs_you", label: "Needs you" };
    const elapsed = run ? elapsedLabel(context.now - run.startedAt) : "";
    if (run && isStalled(run, context.now, context.stallMinutes))
      return { kind: "stalled", label: `Stalled ${elapsed}` };
    return { kind: "running", label: run ? `Running ${elapsed}` : "Starting" };
  }

  if (MANUAL_GATES.includes(card.columnId)) return { kind: "needs_you", label: "Needs you" };
  if (card.columnId === "done") return { kind: "delivered", label: "Delivered" };
  return null;
}
