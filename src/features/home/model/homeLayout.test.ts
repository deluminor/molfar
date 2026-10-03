import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_LAYOUT,
  HOME_LAYOUT_STORAGE_KEY,
  HOME_WIDGET_IDS,
  loadHomeLayout,
  normalizeHomeLayout,
  parseHomeLayout,
  resetHomeLayout,
  saveHomeLayout,
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
  localStorage.removeItem(HOME_LAYOUT_STORAGE_KEY);
});

describe("parseHomeLayout", () => {
  it("includes every widget id in the default", () => {
    expect(DEFAULT_HOME_LAYOUT.map((item) => item.i)).toEqual([
      ...HOME_WIDGET_IDS,
    ]);
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
  it("round-trips a custom layout", () => {
    const custom = normalizeHomeLayout([
      { i: "clock", x: 2, y: 0, w: 4, h: 4 },
      { i: "status", x: 6, y: 0, w: 4, h: 4 },
      { i: "brand", x: 0, y: 0, w: 2, h: 4 },
      { i: "host", x: 0, y: 4, w: 8, h: 5 },
      { i: "sessions", x: 0, y: 9, w: 6, h: 4 },
      { i: "automations", x: 6, y: 9, w: 6, h: 4 },
      { i: "matrix", x: 0, y: 13, w: 12, h: 5 },
    ]);
    saveHomeLayout(custom);
    const loaded = loadHomeLayout();
    expect(loaded.find((item) => item.i === "clock")).toMatchObject({
      x: 2,
      y: 0,
      w: 4,
      h: 4,
      minW: 2,
      minH: 3,
    });
  });

  it("falls back when storage is corrupt", () => {
    localStorage.setItem(HOME_LAYOUT_STORAGE_KEY, "{not-json");
    expect(loadHomeLayout()).toEqual(DEFAULT_HOME_LAYOUT);
  });

  it("reset clears storage and returns the default", () => {
    saveHomeLayout(DEFAULT_HOME_LAYOUT);
    expect(localStorage.getItem(HOME_LAYOUT_STORAGE_KEY)).not.toBeNull();
    const next = resetHomeLayout();
    expect(next).toEqual(DEFAULT_HOME_LAYOUT);
    expect(localStorage.getItem(HOME_LAYOUT_STORAGE_KEY)).toBeNull();
  });
});
