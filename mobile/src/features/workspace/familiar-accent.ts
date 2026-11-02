import Storage from "expo-sqlite/kv-store";
import { useSyncExternalStore } from "react";

import { ACCENTS } from "@/ui/theme";

/** An accent picked for one Familiar's chat, or "theme" for the app's own. */
export type FamiliarAccent = keyof typeof ACCENTS | "theme";

// Kept on this phone, per desktop and Familiar, as reactions are.
const KEY = "molfar.familiarAccents";
let accents: Readonly<Record<string, FamiliarAccent>> = load();
const listeners = new Set<() => void>();

function load() {
  try {
    return JSON.parse(Storage.getItemSync(KEY) ?? "{}") as Record<string, FamiliarAccent>;
  } catch {
    return {};
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Draws this Familiar's chat in `accent`, or back in the app's own for "theme". */
export function setFamiliarAccent(familiarId: string, accent: FamiliarAccent) {
  const { [familiarId]: _, ...rest } = accents;
  accents = accent === "theme" ? rest : { ...rest, [familiarId]: accent };
  void Storage.setItem(KEY, JSON.stringify(accents));
  listeners.forEach((listener) => listener());
}

/** The accent picked for this Familiar's chat. */
export function useFamiliarAccent(familiarId: string | undefined): FamiliarAccent {
  return useSyncExternalStore(subscribe, () => (familiarId ? accents[familiarId] : undefined) ?? "theme");
}
