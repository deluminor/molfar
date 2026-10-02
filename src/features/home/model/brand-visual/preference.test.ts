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

it("restores either saved visual", () => {
  saveBrandVisual("orb");
  expect(readBrandVisual()).toBe("orb");
  saveBrandVisual("fire");
  expect(readBrandVisual()).toBe("fire");
});

it.each([
  ["dragon", "fire"],
  ["jarvis", "orb"],
  [null, "fire"],
] as const)("migrates the stored value %s to %s", (stored, expected) => {
  expect(parseBrandVisual(stored)).toBe(expected);
});

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
