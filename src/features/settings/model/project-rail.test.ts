// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIVE_AGENTS_MIN_COUNT_CHANGE_EVENT,
  LIVE_AGENTS_MIN_COUNT_DEFAULT,
  LIVE_AGENTS_MIN_COUNT_MAX,
  RAIL_SURFACES_CHANGE_EVENT,
  clampLiveAgentsMinCount,
  loadLiveAgentsMinCount,
  loadRailSurfaces,
  saveLiveAgentsMinCount,
  saveRailSurfaceVisible,
} from "./project-rail";

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
    clear: () => stored.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rail surfaces", () => {
  it("shows every surface by default", () => {
    expect(loadRailSurfaces()).toEqual({
      home: true,
      usage: true,
      knowledge: true,
    });
  });

  it("hides one surface and notifies listeners", () => {
    const listener = vi.fn();
    window.addEventListener(RAIL_SURFACES_CHANGE_EVENT, listener);

    saveRailSurfaceVisible("usage", false);

    window.removeEventListener(RAIL_SURFACES_CHANGE_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadRailSurfaces()).toEqual({
      home: true,
      usage: false,
      knowledge: true,
    });
  });

  it("returns a stable snapshot while nothing changes", () => {
    saveRailSurfaceVisible("home", false);
    const first = loadRailSurfaces();

    expect(loadRailSurfaces()).toBe(first);

    saveRailSurfaceVisible("home", true);
    expect(loadRailSurfaces()).not.toBe(first);
  });
});

describe("working agents threshold", () => {
  it("defaults to two chats", () => {
    expect(loadLiveAgentsMinCount()).toBe(LIVE_AGENTS_MIN_COUNT_DEFAULT);
  });

  it("persists a single-chat threshold and notifies listeners", () => {
    const listener = vi.fn();
    window.addEventListener(LIVE_AGENTS_MIN_COUNT_CHANGE_EVENT, listener);

    saveLiveAgentsMinCount(1);

    window.removeEventListener(LIVE_AGENTS_MIN_COUNT_CHANGE_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadLiveAgentsMinCount()).toBe(1);
  });

  it("clamps out-of-range and corrupt values", () => {
    expect(clampLiveAgentsMinCount(0)).toBe(1);
    expect(clampLiveAgentsMinCount(99)).toBe(LIVE_AGENTS_MIN_COUNT_MAX);
    expect(clampLiveAgentsMinCount(2.6)).toBe(3);

    localStorage.setItem("vatra.liveAgentsMinCount", "nope");
    expect(loadLiveAgentsMinCount()).toBe(LIVE_AGENTS_MIN_COUNT_DEFAULT);
  });
});
