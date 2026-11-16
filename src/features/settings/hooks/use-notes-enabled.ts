import { useSyncExternalStore } from "react";
import { loadNotesEnabled, subscribeNotesEnabled } from "../model/settings";

export function useNotesEnabled(): boolean {
  return useSyncExternalStore(subscribeNotesEnabled, loadNotesEnabled, () => true);
}
