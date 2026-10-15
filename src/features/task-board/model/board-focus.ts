type Listener = () => void;

let focusedCardId: string | null = null;
const listeners = new Set<Listener>();

/** Asks the board to open a card's detail, e.g. from a notification click. */
export function requestBoardFocus(cardId: string | null): void {
  focusedCardId = cardId;
  for (const listener of listeners) listener();
}

export function boardFocus(): string | null {
  return focusedCardId;
}

export function subscribeBoardFocus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
