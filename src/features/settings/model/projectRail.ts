import { readFlag, writeFlag } from "./storageFlags";

export type RailSurfaceId = "home" | "usage" | "knowledge";

export type RailSurfaceVisibility = Readonly<Record<RailSurfaceId, boolean>>;

const RAIL_SURFACE_KEYS: Record<RailSurfaceId, string> = {
  home: "vatra.railSurface.home",
  usage: "vatra.railSurface.usage",
  knowledge: "vatra.railSurface.knowledge",
};

/** Fired on `window` when any project rail shortcut is shown or hidden. */
export const RAIL_SURFACES_CHANGE_EVENT = "vatra:rail-surfaces-change";

export const RAIL_SURFACES_DEFAULT: RailSurfaceVisibility = {
  home: true,
  usage: true,
  knowledge: true,
};

// useSyncExternalStore compares snapshots by identity, so an unchanged
// visibility must hand back the same object or the rail re-renders forever.
let railSurfacesSnapshot: RailSurfaceVisibility = RAIL_SURFACES_DEFAULT;

export function loadRailSurfaces(): RailSurfaceVisibility {
  const next: RailSurfaceVisibility = {
    home: readRailSurface("home"),
    usage: readRailSurface("usage"),
    knowledge: readRailSurface("knowledge"),
  };

  const unchanged =
    next.home === railSurfacesSnapshot.home &&
    next.usage === railSurfacesSnapshot.usage &&
    next.knowledge === railSurfacesSnapshot.knowledge;
  if (!unchanged) railSurfacesSnapshot = next;

  return railSurfacesSnapshot;
}

export function saveRailSurfaceVisible(id: RailSurfaceId, visible: boolean) {
  writeFlag(RAIL_SURFACE_KEYS[id], visible);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RAIL_SURFACES_CHANGE_EVENT));
}

export function subscribeRailSurfaces(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(RAIL_SURFACES_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(RAIL_SURFACES_CHANGE_EVENT, onStoreChange);
}

function readRailSurface(id: RailSurfaceId): boolean {
  return readFlag(RAIL_SURFACE_KEYS[id]) ?? RAIL_SURFACES_DEFAULT[id];
}

const LIVE_AGENTS_MIN_COUNT_KEY = "vatra.liveAgentsMinCount";

export const LIVE_AGENTS_MIN_COUNT_DEFAULT = 2;
export const LIVE_AGENTS_MIN_COUNT_MAX = 8;

/** Fired on `window` when the working-agents card threshold changes. */
export const LIVE_AGENTS_MIN_COUNT_CHANGE_EVENT =
  "vatra:live-agents-min-count-change";

export function clampLiveAgentsMinCount(value: number): number {
  if (!Number.isFinite(value)) return LIVE_AGENTS_MIN_COUNT_DEFAULT;

  return Math.min(LIVE_AGENTS_MIN_COUNT_MAX, Math.max(1, Math.round(value)));
}

export function loadLiveAgentsMinCount(): number {
  try {
    const raw = localStorage.getItem(LIVE_AGENTS_MIN_COUNT_KEY);
    if (raw == null) return LIVE_AGENTS_MIN_COUNT_DEFAULT;

    return clampLiveAgentsMinCount(Number(raw));
  } catch {
    return LIVE_AGENTS_MIN_COUNT_DEFAULT;
  }
}

export function saveLiveAgentsMinCount(value: number) {
  const next = clampLiveAgentsMinCount(value);
  try {
    localStorage.setItem(LIVE_AGENTS_MIN_COUNT_KEY, String(next));
  } catch {
    // private mode / quota
  }

  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<number>(LIVE_AGENTS_MIN_COUNT_CHANGE_EVENT, {
      detail: next,
    }),
  );
}

export function subscribeLiveAgentsMinCount(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(LIVE_AGENTS_MIN_COUNT_CHANGE_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(
      LIVE_AGENTS_MIN_COUNT_CHANGE_EVENT,
      onStoreChange,
    );
}
