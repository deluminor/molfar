import { transition, type BoardActionType, type TransitionEffect } from "../model/transitions";
import type { Card, CardPatch } from "../types/card";
import { writeCard } from "./card-writer";
import type { BoardStorePort } from "./ports";

export class IllegalTransitionError extends Error {}

export type TransitionResult = { card: Card; effects: TransitionEffect[] };

/**
 * Applies one state-machine action through compare-and-swap. `extra` adds
 * fields that belong to the same write (an error text, a delivery record).
 */
export async function transitionCard(
  store: BoardStorePort,
  cardId: string,
  action: BoardActionType,
  extra?: (card: Card) => CardPatch,
): Promise<TransitionResult> {
  let effects: TransitionEffect[] = [];
  const card = await writeCard(store, cardId, (current) => {
    const result = transition(current, action);
    if (!result.ok) throw new IllegalTransitionError(result.reason);

    effects = result.effects;
    const patch: CardPatch = {
      columnId: result.columnId,
      runState: result.runState,
      archived: result.archived,
    };
    if (effects.includes("resetGrillRound")) patch.grillRound = 1;
    if (effects.includes("nextGrillRound")) patch.grillRound = current.grillRound + 1;
    if (effects.includes("nextReworkCycle")) patch.reworkCycle = current.reworkCycle + 1;
    if (effects.includes("clearError")) patch.lastError = null;
    return { ...patch, ...extra?.(current) };
  });

  if (!card) throw new IllegalTransitionError("The card could not be updated.");
  return { card, effects };
}
