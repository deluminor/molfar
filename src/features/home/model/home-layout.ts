/** Persistable Home dashboard grid layout (react-grid-layout units). */

export const HOME_LAYOUT_STORAGE_KEY = "molfar.homeLayout.v2";
export const HOME_LAYOUT_LEGACY_STORAGE_KEY = "molfar.homeLayout.v1";

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
  "usage",
  "inbox",
  "git",
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

/** Position/size as RGL reports it; `i` may be any string until parsed. */
export type HomeLayoutUpdate = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Erik DEV factory layout — reset / fresh installs only; never force-migrate. */
const DEFAULT_BY_ID: Record<HomeWidgetId, HomeLayoutItem> = {
  clock: { i: "clock", x: 0, y: 0, w: 2, h: 4, minW: 2, minH: 3 },
  status: { i: "status", x: 2, y: 0, w: 2, h: 4, minW: 2, minH: 3 },
  git: { i: "git", x: 4, y: 0, w: 6, h: 4, minW: 3, minH: 3 },
  brand: { i: "brand", x: 10, y: 0, w: 2, h: 4, minW: 2, minH: 3 },
  inbox: { i: "inbox", x: 0, y: 4, w: 4, h: 4, minW: 2, minH: 3 },
  sessions: { i: "sessions", x: 4, y: 4, w: 4, h: 4, minW: 3, minH: 3 },
  automations: { i: "automations", x: 8, y: 4, w: 4, h: 4, minW: 3, minH: 3 },
  host: { i: "host", x: 0, y: 8, w: 8, h: 4, minW: 3, minH: 3 },
  usage: { i: "usage", x: 8, y: 8, w: 4, h: 4, minW: 3, minH: 3 },
  matrix: { i: "matrix", x: 0, y: 12, w: 12, h: 7, minW: 4, minH: 3 },
};

/** Wide default matching Erik's Home arrangement. */
export const DEFAULT_HOME_LAYOUT: HomeLayout = HOME_WIDGET_IDS.map(
  (id) => DEFAULT_BY_ID[id],
);

/** Full-width stack for viewports below the edit breakpoint. */
export const NARROW_HOME_LAYOUT: HomeLayout = [
  { i: "clock", x: 0, y: 0, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "status", x: 0, y: 4, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "automations", x: 0, y: 8, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "inbox", x: 0, y: 12, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "brand", x: 0, y: 16, w: 12, h: 8, minW: 12, minH: 4 },
  { i: "host", x: 0, y: 24, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "sessions", x: 0, y: 28, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "git", x: 0, y: 32, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "usage", x: 0, y: 36, w: 12, h: 4, minW: 12, minH: 3 },
  { i: "matrix", x: 0, y: 40, w: 12, h: 10, minW: 12, minH: 3 },
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
  const w = Math.max(
    defaults.minW,
    Math.min(HOME_LAYOUT_COLS, Math.round(wRaw)),
  );
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
  items: readonly HomeLayoutUpdate[],
): HomeLayout {
  return parseHomeLayout(items);
}

/** Visible-only RGL updates overwrite their ids; hidden widgets keep their geometry. */
export function mergeHomeLayout(
  current: HomeLayout,
  updates: readonly HomeLayoutUpdate[],
): HomeLayout {
  return parseHomeLayout([...current, ...updates]);
}

/** Layout geometry for every widget plus the ids the user turned off. */
export type HomeLayoutState = {
  layout: HomeLayout;
  hidden: readonly HomeWidgetId[];
};

export const DEFAULT_HOME_LAYOUT_STATE: HomeLayoutState = {
  layout: DEFAULT_HOME_LAYOUT,
  hidden: [],
};

function parseHidden(value: unknown): HomeWidgetId[] {
  if (!Array.isArray(value)) return [];
  const ids = HOME_WIDGET_IDS.filter((id) => value.includes(id));
  return ids.length >= HOME_WIDGET_IDS.length ? [] : ids;
}

/** Accepts the v2 `{ layout, hidden }` object or a bare v1 layout array. */
export function parseHomeLayoutState(value: unknown): HomeLayoutState {
  if (Array.isArray(value))
    return { layout: parseHomeLayout(value), hidden: [] };
  if (value == null || typeof value !== "object") {
    return DEFAULT_HOME_LAYOUT_STATE;
  }
  const record = value as Record<string, unknown>;
  return {
    layout: parseHomeLayout(record.layout),
    hidden: parseHidden(record.hidden),
  };
}

export function canHideHomeWidget(
  state: HomeLayoutState,
  id: HomeWidgetId,
): boolean {
  if (state.hidden.includes(id)) return false;
  return HOME_WIDGET_IDS.length - state.hidden.length > 1;
}

/** Returns the same state when hiding would leave Home empty. */
export function hideHomeWidget(
  state: HomeLayoutState,
  id: HomeWidgetId,
): HomeLayoutState {
  if (!canHideHomeWidget(state, id)) return state;
  return { ...state, hidden: parseHidden([...state.hidden, id]) };
}

export function showHomeWidget(
  state: HomeLayoutState,
  id: HomeWidgetId,
): HomeLayoutState {
  if (!state.hidden.includes(id)) return state;
  return {
    ...state,
    hidden: state.hidden.filter((hiddenId) => hiddenId !== id),
  };
}

/** Items RGL should render: `base` defaults to the stored wide layout. */
export function visibleHomeLayout(
  state: HomeLayoutState,
  base: HomeLayout = state.layout,
): HomeLayout {
  return base.filter((item) => !state.hidden.includes(item.i));
}

function clearLegacyHomeLayout(): void {
  try {
    localStorage.removeItem(HOME_LAYOUT_LEGACY_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear legacy home layout:", error);
  }
}

function migrateLegacyHomeLayout(legacyRaw: string): HomeLayoutState {
  const migrated = parseHomeLayoutState(JSON.parse(legacyRaw) as unknown);
  // Keep v1 until v2 lands — a failed write must not discard the user's layout.
  if (saveHomeLayoutState(migrated)) clearLegacyHomeLayout();
  return migrated;
}

function readStoredState(): HomeLayoutState {
  const raw = localStorage.getItem(HOME_LAYOUT_STORAGE_KEY);
  if (raw != null) {
    try {
      return parseHomeLayoutState(JSON.parse(raw) as unknown);
    } catch (error) {
      console.error("Failed to parse home layout v2; trying legacy:", error);
    }
  }
  const legacy = localStorage.getItem(HOME_LAYOUT_LEGACY_STORAGE_KEY);
  if (legacy == null) return DEFAULT_HOME_LAYOUT_STATE;
  return migrateLegacyHomeLayout(legacy);
}

/** Reads v2 state, migrating a v1 layout once; corrupt storage yields defaults. */
export function loadHomeLayoutState(): HomeLayoutState {
  try {
    return readStoredState();
  } catch (error) {
    console.error("Failed to load home layout:", error);
    return DEFAULT_HOME_LAYOUT_STATE;
  }
}

/**
 * Persists only position/size and hidden ids; mins are reapplied on load.
 * @returns false when storage rejects the write so callers can keep prior state.
 */
export function saveHomeLayoutState(state: HomeLayoutState): boolean {
  const payload = {
    layout: state.layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
    hidden: state.hidden,
  };
  try {
    localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error("Failed to save home layout:", error);
    return false;
  }
}

/**
 * Clears stored layout (both versions) and returns the all-visible default.
 * @returns null when storage rejects the clear so callers keep prior UI state.
 */
export function resetHomeLayoutState(): HomeLayoutState | null {
  try {
    localStorage.removeItem(HOME_LAYOUT_STORAGE_KEY);
    localStorage.removeItem(HOME_LAYOUT_LEGACY_STORAGE_KEY);
    return DEFAULT_HOME_LAYOUT_STATE;
  } catch (error) {
    console.error("Failed to clear home layout:", error);
    return null;
  }
}
