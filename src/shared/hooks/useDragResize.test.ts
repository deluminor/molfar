// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDragResize } from "./useDragResize";

const KEY = "molfar.paneWidth.test";

type Resize = ReturnType<typeof useDragResize>;

let root: Root;
let container: HTMLDivElement;
let latest: Resize;

function Probe({ storageKey }: { storageKey?: string }) {
  latest = useDragResize({
    min: 200,
    max: () => 500,
    defaultWidth: 260,
    initial: 260,
    storageKey,
  });
  return null;
}

function mount(storageKey?: string) {
  act(() => root.render(createElement(Probe, { storageKey })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("useDragResize persistence", () => {
  it("starts from the stored width", () => {
    localStorage.setItem(KEY, "340");

    mount(KEY);

    expect(latest.width).toBe(340);
  });

  it("clamps a stored width to the live bounds", () => {
    localStorage.setItem(KEY, "9000");

    mount(KEY);

    expect(latest.width).toBe(500);
  });

  it("falls back to initial when nothing is stored", () => {
    mount(KEY);

    expect(latest.width).toBe(260);
  });

  it("writes the default back on double-click reset", () => {
    localStorage.setItem(KEY, "400");
    mount(KEY);

    act(() => latest.onDoubleClick());

    expect(latest.width).toBe(260);
    expect(localStorage.getItem(KEY)).toBe("260");
  });

  it("follows a width saved by another window", () => {
    mount(KEY);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: KEY, newValue: "420" }),
      );
    });

    expect(latest.width).toBe(420);
  });

  it("ignores unrelated or invalid storage events", () => {
    mount(KEY);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "other", newValue: "420" }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", { key: KEY, newValue: "junk" }),
      );
    });

    expect(latest.width).toBe(260);
  });

  it("does not touch storage without a key", () => {
    mount();

    act(() => latest.onDoubleClick());

    expect(localStorage.length).toBe(0);
  });
});
