// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BRAND_VISUAL_STORAGE_KEY } from "./constants";
import {
  parseBrandVisual,
  readBrandVisual,
  saveBrandVisual,
} from "./preference";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("defaults to fire and rejects unknown stored values", () => {
  expect(readBrandVisual()).toBe("fire");
  localStorage.setItem(BRAND_VISUAL_STORAGE_KEY, "unknown");
  expect(readBrandVisual()).toBe("fire");
});

it.each(["sphere", "fire", "orb"] as const)(
  "restores the saved %s visual",
  (visual) => {
    saveBrandVisual(visual);
    expect(readBrandVisual()).toBe(visual);
  },
);

it.each([null, "", "dragon", "jarvis"])(
  "falls back to fire for %s",
  (stored) => {
    expect(parseBrandVisual(stored)).toBe("fire");
  },
);

it("falls back and reports inaccessible storage", () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(localStorage, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(readBrandVisual()).toBe("fire");
  expect(report).toHaveBeenCalledWith(
    "Failed to read home brand visual preference:",
    expect.any(Error),
  );
});

it("reports failed persistence without interrupting selection", () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  expect(() => saveBrandVisual("orb")).not.toThrow();
  expect(report).toHaveBeenCalledWith(
    "Failed to save home brand visual preference:",
    expect.any(Error),
  );
});
