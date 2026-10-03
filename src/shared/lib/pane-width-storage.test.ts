// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadPaneWidth,
  paneWidthStorageKey,
  parsePaneWidth,
  savePaneWidth,
} from "./pane-width-storage";

const KEY = paneWidthStorageKey("test");

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("paneWidthStorage", () => {
  it("namespaces keys under vatra.paneWidth", () => {
    expect(KEY).toBe("vatra.paneWidth.test");
  });

  it("round-trips a rounded width", () => {
    savePaneWidth(KEY, 312.6);

    expect(localStorage.getItem(KEY)).toBe("313");
    expect(loadPaneWidth(KEY)).toBe(313);
  });

  it("returns null for a missing key", () => {
    expect(loadPaneWidth(KEY)).toBeNull();
  });

  it.each([null, "", "  ", "abc", "NaN", "Infinity", "0", "-20"])(
    "rejects %j",
    (raw) => {
      expect(parsePaneWidth(raw)).toBeNull();
    },
  );

  it("survives storage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });

    expect(() => savePaneWidth(KEY, 300)).not.toThrow();
    expect(loadPaneWidth(KEY)).toBeNull();
  });
});
