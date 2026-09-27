/** Persistable Home dashboard grid layout (react-grid-layout units). */

export const HOME_LAYOUT_STORAGE_KEY = "monocode.homeLayout.v1";

export const HOME_LAYOUT_COLS = 12;
export const HOME_LAYOUT_ROW_HEIGHT = 40;
export const HOME_LAYOUT_MARGIN: readonly [number, number] = [12, 12];

/** Tailwind `md` — edit mode only at this width and above. */
export const HOME_LAYOUT_EDIT_MIN_WIDTH_PX = 768;

export const HOME_WIDGET_IDS = [
  "clock",
  "status",
  "brand",
  "host",
  "sessions",
  "automations",
  "matrix",
] as const;

export type HomeWidgetId = (typeof HOME_WIDGET_IDS)[number];

export type HomeLayoutItem = {
  i: HomeWidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
};

export type HomeLayout = readonly HomeLayoutItem[];

type PersistableItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

const DEFAULT_BY_ID: Record<HomeWidgetId, HomeLayoutItem> = {
  clock: { i: "clock", x: 0, y: 0, w: 4, h: 4, minW: 2, minH: 3 },
  status: { i: "status", x: 4, y: 0, w: 4, h: 4, minW: 2, minH: 3 },
  brand: { i: "brand", x: 8, y: 0, w: 4, h: 9, minW: 2, minH: 4 },
  host: { i: "host", x: 0, y: 4, w: 8, h: 5, minW: 4, minH: 3 },
  sessions: { i: "sessions", x: 0, y: 9, w: 6, h: 4, minW: 3, minH: 3 },
  automations: { i: "automations", x: 6, y: 9, w: 6, h: 4, minW: 3, minH: 3 },
  matrix: { i: "matrix", x: 0, y: 13, w: 12, h: 5, minW: 4, minH: 3 },
};

/** Wide default matching the previous hardcoded Home grid. */
export const DEFAULT_HOME_LAYOUT: HomeLayout = HOME_WIDGET_IDS.map(
  (id) => DEFAULT_BY_ID[id],
);

/** Full-width stack for viewports below the edit breakpoint. */
export const NARROW_HOME_LAYOUT: HomeLayout = [
  { i: "clock", x: 0, y: 0, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "status", x: 0, y: 4, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "brand", x: 0, y: 8, w: 12, h: 7, minW: 12, minH: 4 },
  { i: "host", x: 0, y: 15, w: 12, h: 5, minW: 12, minH: 3 },
  { i: "sessions", x: 0, y: 20, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "automations", x: 0, y: 24, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "matrix", x: 0, y: 28, w: 12, h: 5, minW: 12, minH: 3 },
];

function isHomeWidgetId(value: string): value is HomeWidgetId {
  return (HOME_WIDGET_IDS as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readFiniteNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function clampItem(raw: {
  i: unknown;
  x: unknown;
  y: unknown;
  w: unknown;
  h: unknown;
}): HomeLayoutItem | null {
  if (typeof raw.i !== "string" || !isHomeWidgetId(raw.i)) return null;
  const defaults = DEFAULT_BY_ID[raw.i];
  const xRaw = readFiniteNumber(raw.x);
  const yRaw = readFiniteNumber(raw.y);
  const wRaw = readFiniteNumber(raw.w);
  const hRaw = readFiniteNumber(raw.h);
  if (xRaw == null || yRaw == null || wRaw == null || hRaw == null) return null;
  const w = Math.max(defaults.minW, Math.min(HOME_LAYOUT_COLS, Math.round(wRaw)));
  const h = Math.max(defaults.minH, Math.round(hRaw));
  const x = Math.max(0, Math.min(HOME_LAYOUT_COLS - w, Math.round(xRaw)));
  const y = Math.max(0, Math.round(yRaw));
  return {
    i: raw.i,
    x,
    y,
    w,
    h,
    minW: defaults.minW,
    minH: defaults.minH,
  };
}

/**
 * Parses a stored or RGL layout into a complete Home layout.
 * Missing / invalid widgets fall back to defaults.
 */
export function parseHomeLayout(value: unknown): HomeLayout {
  if (!Array.isArray(value)) return DEFAULT_HOME_LAYOUT;
  const byId = new Map<HomeWidgetId, HomeLayoutItem>();
  for (const entry of value) {
    if (entry == null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const item = clampItem({
      i: record.i,
      x: record.x,
      y: record.y,
      w: record.w,
      h: record.h,
    });
    if (item) byId.set(item.i, item);
  }
  return HOME_WIDGET_IDS.map((id) => byId.get(id) ?? DEFAULT_BY_ID[id]);
}

/** Merges an RGL callback layout with default min sizes. */
export function normalizeHomeLayout(
  items: readonly PersistableItem[],
): HomeLayout {
  return parseHomeLayout(items);
}

/** Reads the wide layout from localStorage, or the default. */
export function loadHomeLayout(): HomeLayout {
  try {
    const raw = localStorage.getItem(HOME_LAYOUT_STORAGE_KEY);
    if (raw == null) return DEFAULT_HOME_LAYOUT;
    return parseHomeLayout(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_HOME_LAYOUT;
  }
}

/** Persists only position/size; mins are reapplied on load. */
export function saveHomeLayout(layout: HomeLayout): void {
  const payload: PersistableItem[] = layout.map(({ i, x, y, w, h }) => ({
    i,
    x,
    y,
    w,
    h,
  }));
  try {
    localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error("Failed to save home layout:", error);
  }
}

/** Clears stored layout and returns the default. */
export function resetHomeLayout(): HomeLayout {
  try {
    localStorage.removeItem(HOME_LAYOUT_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear home layout:", error);
  }
  return DEFAULT_HOME_LAYOUT;
}
