import Storage from "expo-sqlite/kv-store";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { Familiar } from "./types";

// What the user last saw of each familiar, per desktop: its activity then, so a
// reply that came after reads as new. Kept on the phone, as the desktop sends
// no count of its own.
type Seen = Readonly<Record<string, string>>;

const storageKey = (desktop: string) => `molfar.familiarSeen.${desktop}`;
let loadedFor: string | undefined;
let seen: Seen = {};
const listeners = new Set<() => void>();

function load(desktop: string | undefined) {
  if (!desktop || desktop === loadedFor) return;
  loadedFor = desktop;
  try {
    seen = JSON.parse(Storage.getItemSync(storageKey(desktop)) ?? "{}") as Seen;
  } catch {
    seen = {};
  }
}

function save(next: Seen) {
  seen = next;
  if (loadedFor) void Storage.setItem(storageKey(loadedFor), JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A familiar's last reply, as far as the phone can tell; null when it can't,
 *  as when the desktop sends no message for a conversation it hasn't open. */
function activity(familiar: Familiar) {
  return familiar.lastMessage || familiar.lastActiveAt
    ? `${familiar.lastActiveAt}\n${familiar.lastMessage}`
    : null;
}

/** Marks the familiar's latest as seen, as its chat shows it. */
export function markFamiliarSeen(desktop: string | undefined, familiar: Familiar) {
  load(desktop);
  const now = activity(familiar);
  if (now !== null && seen[familiar.id] !== now) save({ ...seen, [familiar.id]: now });
}

/** Marks the familiar's latest as not seen, so it reads as new until opened again. */
export function markFamiliarUnread(desktop: string | undefined, familiar: Familiar) {
  load(desktop);
  if (seen[familiar.id] !== "") save({ ...seen, [familiar.id]: "" });
}

/**
 * The familiars with a reply the user hasn't seen. One seen for the first time
 * counts as seen, so a new phone doesn't open to every familiar marked; one still
 * working has nothing finished to show yet.
 */
export function useUnreadFamiliars(desktop: string | undefined, familiars: Familiar[]): Set<string> {
  load(desktop);
  const current = useSyncExternalStore(subscribe, () => seen);
  useEffect(() => {
    const fresh = familiars.filter((familiar) => !(familiar.id in seen) && activity(familiar) !== null);
    if (fresh.length)
      save({ ...seen, ...Object.fromEntries(fresh.map((familiar) => [familiar.id, activity(familiar)!])) });
  }, [familiars]);
  return useMemo(
    () =>
      new Set(
        familiars
          .filter((familiar) => {
            if (familiar.status === "working") return false;
            if (familiar.unread > 0) return true;
            const now = activity(familiar);
            return now !== null && familiar.id in current && current[familiar.id] !== now;
          })
          .map((familiar) => familiar.id),
      ),
    [familiars, current],
  );
}
