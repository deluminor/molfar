// The new-Familiar sheet is a route of its own, presented over the list or the
// drawer, so the Familiar it made comes back to them through here to be opened.
const listeners = new Set<(familiarId: string) => void>();

/** Hands the Familiar just made to whichever screen opens it. */
export function familiarCreated(familiarId: string) {
  listeners.forEach((listener) => listener(familiarId));
}

/** Calls `listener` with each Familiar made; returns the unsubscribe. */
export function onFamiliarCreated(listener: (familiarId: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
