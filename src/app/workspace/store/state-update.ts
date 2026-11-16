/** A new value, or a function of the previous one, as React's setState takes. */
export type StateUpdate<T> = T | ((previous: T) => T);

export function applyStateUpdate<T>(previous: T, update: StateUpdate<T>): T {
  return typeof update === "function"
    ? (update as (previous: T) => T)(previous)
    : update;
}
