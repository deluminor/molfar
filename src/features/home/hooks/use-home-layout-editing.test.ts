// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOME_LAYOUT_STORAGE_KEY,
  HOME_WIDGET_IDS,
  loadHomeLayoutState,
} from "../model/home-layout";
import {
  useHomeLayoutEditing,
  type HomeLayoutEditing,
} from "./use-home-layout-editing";

let container: HTMLDivElement;
let root: Root;
let latest: HomeLayoutEditing | null = null;

function Probe() {
  latest = useHomeLayoutEditing();
  return null;
}

function editing(): HomeLayoutEditing {
  if (!latest) throw new Error("hook not rendered");
  return latest;
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(Probe));
  });
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** Fresh storage each test — some cases replace localStorage with a throwing stub. */
function stubLocalStorage(): void {
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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stubLocalStorage();
  stubMatchMedia(true);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  latest = null;
  vi.unstubAllGlobals();
});

describe("useHomeLayoutEditing visibility", () => {
  it("hides a widget from the grid and persists it", async () => {
    await render();
    await act(async () => editing().onHideWidget("matrix"));

    expect(editing().hidden).toEqual(["matrix"]);
    expect(editing().layout.map((item) => item.i)).not.toContain("matrix");
    expect(loadHomeLayoutState().hidden).toEqual(["matrix"]);
  });

  it("keeps hidden geometry when the grid commits visible items only", async () => {
    await render();
    await act(async () =>
      editing().onLayoutCommit([{ i: "brand", x: 0, y: 30, w: 3, h: 6 }]),
    );
    await act(async () => editing().onHideWidget("brand"));
    await act(async () =>
      editing().onLayoutCommit([{ i: "clock", x: 6, y: 0, w: 4, h: 4 }]),
    );
    await act(async () => editing().onShowWidget("brand"));

    expect(editing().layout.find((item) => item.i === "brand")).toMatchObject({
      y: 30,
      w: 3,
    });
  });

  it("reset shows every widget and clears storage", async () => {
    await render();
    await act(async () => editing().onHideWidget("git"));
    await act(async () => editing().onResetLayout());

    expect(editing().hidden).toEqual([]);
    expect(editing().layout).toHaveLength(HOME_WIDGET_IDS.length);
    expect(localStorage.getItem(HOME_LAYOUT_STORAGE_KEY)).toBeNull();
  });

  it("narrow windows stack only visible widgets", async () => {
    stubMatchMedia(false);
    await render();
    await act(async () => editing().onHideWidget("inbox"));

    expect(editing().layout.map((item) => item.i)).not.toContain("inbox");
    expect(editing().layout.every((item) => item.w === 12)).toBe(true);
  });

  it("keeps React state when persist fails", async () => {
    await render();
    const prior = window.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => prior.getItem(key),
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: (key: string) => prior.removeItem(key),
        clear: () => prior.clear(),
        key: (index: number) => prior.key(index),
        get length() {
          return prior.length;
        },
      },
      configurable: true,
    });

    await act(async () => editing().onHideWidget("matrix"));

    expect(editing().hidden).toEqual([]);
    expect(editing().layout.map((item) => item.i)).toContain("matrix");
  });

  it("keeps React state when reset cannot clear storage", async () => {
    await render();
    await act(async () => editing().onHideWidget("git"));
    expect(editing().hidden).toEqual(["git"]);

    const prior = window.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: (key: string) => prior.getItem(key),
        setItem: (key: string, value: string) => prior.setItem(key, value),
        removeItem: () => {
          throw new Error("denied");
        },
        clear: () => prior.clear(),
        key: (index: number) => prior.key(index),
        get length() {
          return prior.length;
        },
      },
      configurable: true,
    });

    await act(async () => editing().onResetLayout());

    expect(editing().hidden).toEqual(["git"]);
    expect(editing().layout.map((item) => item.i)).not.toContain("git");
  });
});
