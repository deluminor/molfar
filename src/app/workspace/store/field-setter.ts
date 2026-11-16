import type { StoreApi } from "zustand/vanilla";
import { applyStateUpdate, type StateUpdate } from "./state-update";

/**
 * A setter for one store field with React setState semantics: it takes a
 * value or an updater, and an unchanged value (`Object.is`) notifies nobody.
 */
export function fieldSetter<S, K extends keyof S>(
  store: Pick<StoreApi<S>, "getState" | "setState">,
  key: K,
): (update: StateUpdate<S[K]>) => void {
  return (update) => {
    const previous = store.getState()[key];
    const next = applyStateUpdate(previous, update);
    if (Object.is(next, previous)) return;

    store.setState({ [key]: next } as unknown as Partial<S>);
  };
}
