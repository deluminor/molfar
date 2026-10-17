import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_LAYOUT,
  DEFAULT_HOME_LAYOUT_STATE,
  HOME_LAYOUT_LEGACY_STORAGE_KEY,
  HOME_LAYOUT_STORAGE_KEY,
  HOME_WIDGET_IDS,
  NARROW_HOME_LAYOUT,
  canHideHomeWidget,
  hideHomeWidget,
  loadHomeLayoutState,
  mergeHomeLayout,
  normalizeHomeLayout,
  parseHomeLayout,
  resetHomeLayoutState,
  saveHomeLayoutState,
  showHomeWidget,
  visibleHomeLayout,
  type HomeLayoutState,
} from "./homeLayout";

function mockLocalStorage(): void {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => {
        data.clear();
      },
      key: (index: number) => [...data.keys()][index] ?? null,
      get length() {
        return data.size;
      },
    },
    configurable: true,
  });
}

beforeEach(() => {
  mockLocalStorage();
});

afterEach(() => {
  localStorage.clear();
});

describe("parseHomeLayout", () => {
  it("includes every widget id in the default and narrow layouts", () => {
    expect(DEFAULT_HOME_LAYOUT.map((item) => item.i)).toEqual([
      ...HOME_WIDGET_IDS,
    ]);
    expect([...NARROW_HOME_LAYOUT.map((item) => item.i)].sort()).toEqual(
      [...HOME_WIDGET_IDS].sort(),
    );
    expect(HOME_WIDGET_IDS).toEqual(
      expect.arrayContaining(["usage", "inbox", "git"]),
    );
  });

  it("uses the Erik DEV factory geometry", () => {
    const byId = Object.fromEntries(
      DEFAULT_HOME_LAYOUT.map((item) => [item.i, item]),
    );
    expect(byId.clock).toMatchObject({ x: 0, y: 0, w: 2, h: 4 });
    expect(byId.status).toMatchObject({ x: 2, y: 0, w: 2, h: 4 });
    expect(byId.automations).toMatchObject({ x: 4, y: 0, w: 3, h: 4 });
    expect(byId.inbox).toMatchObject({ x: 7, y: 0, w: 3, h: 4 });
    expect(byId.brand).toMatchObject({ x: 10, y: 0, w: 2, h: 12 });
    expect(byId.host).toMatchObject({ x: 0, y: 4, w: 4, h: 4 });
    expect(byId.sessions).toMatchObject({ x: 4, y: 4, w: 3, h: 4 });
    expect(byId.git).toMatchObject({ x: 7, y: 4, w: 3, h: 4 });
    expect(byId.usage).toMatchObject({ x: 0, y: 8, w: 10, h: 4 });
    expect(byId.matrix).toMatchObject({ x: 0, y: 12, w: 12, h: 13 });
    expect(DEFAULT_HOME_LAYOUT_STATE.hidden).toEqual([]);
  });

  it("falls back to default for non-arrays", () => {
    expect(parseHomeLayout(null)).toEqual(DEFAULT_HOME_LAYOUT);
    expect(parseHomeLayout({})).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it("fills missing widgets from defaults and clamps sizes", () => {
    const parsed = parseHomeLayout([
      { i: "clock", x: 0, y: 0, w: 1, h: 1 },
      { i: "unknown", x: 0, y: 0, w: 4, h: 4 },
    ]);
    const clock = parsed.find((item) => item.i === "clock");
    expect(clock?.w).toBeGreaterThanOrEqual(2);
    expect(clock?.h).toBeGreaterThanOrEqual(3);
    expect(parsed.map((item) => item.i)).toEqual([...HOME_WIDGET_IDS]);
  });
});

describe("homeLayout persistence", () => {
  it("round-trips layout and hidden set", () => {
    const layout = normalizeHomeLayout([
      { i: "clock", x: 2, y: 0, w: 4, h: 4 },
    ]);
    saveHomeLayoutState({ layout, hidden: ["matrix"] });
    const loaded = loadHomeLayoutState();
    expect(loaded.hidden).toEqual(["matrix"]);
    expect(loaded.layout.find((item) => item.i === "clock")).toMatchObject({
      x: 2,
      w: 4,
      minW: 2,
    });
  });

  it("migrates a v1 array keeping positions with nothing hidden", () => {
    localStorage.setItem(
      HOME_LAYOUT_LEGACY_STORAGE_KEY,
      JSON.stringify([{ i: "status", x: 8, y: 3, w: 4, h: 5 }]),
    );
    const loaded = loadHomeLayoutState();
    expect(loaded.hidden).toEqual([]);
    expect(loaded.layout.find((item) => item.i === "status")).toMatchObject({
      x: 8,
      y: 3,
      w: 4,
      h: 5,
    });
    expect(localStorage.getItem(HOME_LAYOUT_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(HOME_LAYOUT_LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("ignores unknown hidden ids and never hides every widget", () => {
    saveHomeLayoutState({ layout: DEFAULT_HOME_LAYOUT, hidden: [] });
    localStorage.setItem(
      HOME_LAYOUT_STORAGE_KEY,
      JSON.stringify({ layout: [], hidden: ["nope", "brand", "brand"] }),
    );
    expect(loadHomeLayoutState().hidden).toEqual(["brand"]);

    localStorage.setItem(
      HOME_LAYOUT_STORAGE_KEY,
      JSON.stringify({ layout: [], hidden: [...HOME_WIDGET_IDS] }),
    );
    expect(loadHomeLayoutState().hidden).toEqual([]);
  });

  it("falls back when storage is corrupt", () => {
    localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, "{not-json");
    expect(loadHomeLayoutState()).toEqual(DEFAULT_HOME_LAYOUT_STATE);
  });

  it("falls back to a valid v1 layout when v2 JSON is corrupt", () => {
    localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, "{not-json");
    localStorage.setItem(
      HOME_LAYOUT_LEGACY_STORAGE_KEY,
      JSON.stringify([{ i: "host", x: 1, y: 2, w: 6, h: 4 }]),
    );
    const loaded = loadHomeLayoutState();
    expect(loaded.hidden).toEqual([]);
    expect(loaded.layout.find((item) => item.i === "host")).toMatchObject({
      x: 1,
      y: 2,
      w: 6,
      h: 4,
    });
    expect(localStorage.getItem(HOME_LAYOUT_LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("does not report success when setItem throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    expect(
      saveHomeLayoutState({ layout: DEFAULT_HOME_LAYOUT, hidden: ["matrix"] }),
    ).toBe(false);
  });

  it("keeps the v1 key when migrate cannot persist v2", () => {
    const legacy = JSON.stringify([{ i: "status", x: 8, y: 3, w: 4, h: 5 }]);
    const data = new Map<string, string>([
      [HOME_LAYOUT_LEGACY_STORAGE_KEY, legacy],
    ]);
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (key === HOME_LAYOUT_STORAGE_KEY) throw new Error("quota");
          data.set(key, value);
        },
        removeItem: (key: string) => {
          data.delete(key);
        },
        clear: () => data.clear(),
        key: (index: number) => [...data.keys()][index] ?? null,
        get length() {
          return data.size;
        },
      },
      configurable: true,
    });

    const loaded = loadHomeLayoutState();
    expect(loaded.layout.find((item) => item.i === "status")).toMatchObject({
      x: 8,
      y: 3,
    });
    expect(localStorage.getItem(HOME_LAYOUT_LEGACY_STORAGE_KEY)).toBe(legacy);
    expect(localStorage.getItem(HOME_LAYOUT_STORAGE_KEY)).toBeNull();
  });

  it("reset clears both keys and shows every widget", () => {
    saveHomeLayoutState({ layout: DEFAULT_HOME_LAYOUT, hidden: ["git"] });
    localStorage.setItem(HOME_LAYOUT_LEGACY_STORAGE_KEY, "[]");
    expect(resetHomeLayoutState()).toEqual(DEFAULT_HOME_LAYOUT_STATE);
    expect(localStorage.getItem(HOME_LAYOUT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(HOME_LAYOUT_LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("returns null when reset cannot clear storage", () => {
    saveHomeLayoutState({ layout: DEFAULT_HOME_LAYOUT, hidden: ["git"] });
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => {
          throw new Error("denied");
        },
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
      configurable: true,
    });
    expect(resetHomeLayoutState()).toBeNull();
  });
});

describe("widget visibility", () => {
  it("hides and shows a widget keeping its last position", () => {
    const layout = normalizeHomeLayout([
      { i: "brand", x: 0, y: 20, w: 3, h: 6 },
    ]);
    const hidden = hideHomeWidget({ layout, hidden: [] }, "brand");
    expect(hidden.hidden).toEqual(["brand"]);
    expect(visibleHomeLayout(hidden).some((item) => item.i === "brand")).toBe(
      false,
    );

    const shown = showHomeWidget(hidden, "brand");
    expect(shown.hidden).toEqual([]);
    expect(
      visibleHomeLayout(shown).find((item) => item.i === "brand"),
    ).toMatchObject({ x: 0, y: 20, w: 3, h: 6 });
  });

  it("blocks hiding the last visible widget", () => {
    const allButClock: HomeLayoutState = {
      layout: DEFAULT_HOME_LAYOUT,
      hidden: HOME_WIDGET_IDS.filter((id) => id !== "clock"),
    };
    expect(canHideHomeWidget(allButClock, "clock")).toBe(false);
    expect(hideHomeWidget(allButClock, "clock")).toBe(allButClock);
    expect(canHideHomeWidget(DEFAULT_HOME_LAYOUT_STATE, "clock")).toBe(true);
  });

  it("filters the narrow stack with the same hidden set", () => {
    const visible = visibleHomeLayout(
      { layout: DEFAULT_HOME_LAYOUT, hidden: ["matrix", "inbox"] },
      NARROW_HOME_LAYOUT,
    );
    expect(visible.map((item) => item.i)).not.toContain("matrix");
    expect(visible.map((item) => item.i)).not.toContain("inbox");
    expect(visible.every((item) => item.w === 12)).toBe(true);
  });

  it("merges a visible-only RGL layout without dropping hidden positions", () => {
    const layout = normalizeHomeLayout([
      { i: "brand", x: 0, y: 30, w: 3, h: 6 },
    ]);
    const merged = mergeHomeLayout(layout, [
      { i: "clock", x: 6, y: 0, w: 4, h: 4 },
    ]);
    expect(merged.find((item) => item.i === "clock")).toMatchObject({ x: 6 });
    expect(merged.find((item) => item.i === "brand")).toMatchObject({
      y: 30,
      w: 3,
    });
  });
});
