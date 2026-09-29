// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BRAND_VISUAL_STORAGE_KEY } from "./brand-visual-constants";
import { readBrandVisual, saveBrandVisual } from "./brand-visual-preference";

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

it("defaults to dragon and rejects unknown stored values", () => {
  expect(readBrandVisual()).toBe("dragon");
  localStorage.setItem(BRAND_VISUAL_STORAGE_KEY, "unknown");
  expect(readBrandVisual()).toBe("dragon");
});

it("restores either saved visual", () => {
  saveBrandVisual("jarvis");
  expect(readBrandVisual()).toBe("jarvis");
  saveBrandVisual("dragon");
  expect(readBrandVisual()).toBe("dragon");
});

it("falls back and reports inaccessible storage", () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(localStorage, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(readBrandVisual()).toBe("dragon");
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
  expect(() => saveBrandVisual("jarvis")).not.toThrow();
  expect(report).toHaveBeenCalledWith(
    "Failed to save home brand visual preference:",
    expect.any(Error),
  );
});
