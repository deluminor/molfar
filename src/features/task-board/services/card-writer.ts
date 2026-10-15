import { CONFLICT_PREFIX } from "../constants/limits";
import type { Card, CardPatch } from "../types/card";
import type { BoardStorePort } from "./ports";

const MAX_ATTEMPTS = 3;

export function isConflict(error: unknown): boolean {
  return String(error).startsWith(CONFLICT_PREFIX);
}

/**
 * Re-reads the card and re-derives the patch on every attempt, so a phone and
 * the desktop acting together never apply a decision made on stale state.
 * `derive` returns null to abandon the write.
 */
export async function writeCard(
  store: BoardStorePort,
  cardId: string,
  derive: (card: Card) => CardPatch | null,
): Promise<Card | null> {
  for (let attempt = 1; ; attempt++) {
    const card = await store.getCard(cardId);
    if (!card) throw new Error("Card not found.");
    const patch = derive(card);
    if (!patch) return null;

    try {
      return await store.updateCard(card.id, card.updatedAt, patch);
    } catch (error: unknown) {
      if (!isConflict(error) || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}
