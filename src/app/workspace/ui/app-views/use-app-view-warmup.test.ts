// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { useAppViewWarmup } from "./use-app-view-warmup";

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), preload: vi.fn() }));

vi.mock("../../../model/preload-navigation", () => ({
  preloadNavigationWhenIdle: (preloaders: unknown[]) => {
    mocks.preload(preloaders.length);
    return mocks.cancel;
  },
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => vi.clearAllMocks());

describe("useAppViewWarmup", () => {
  it("preloads Notes only while enabled, closes Notes when disabled and cancels a stale preload", () => {
    const store = createWorkspaceStore(testWorkspaceState({ notesViewOpen: true }));
    let notesEnabled = true;
    function Probe() {
      useAppViewWarmup(store, notesEnabled);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe)));
    expect(mocks.preload).toHaveBeenLastCalledWith(6);
    expect(store.getState().notesViewOpen).toBe(true);

    notesEnabled = false;
    act(() => root.render(createElement(Probe)));
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.preload).toHaveBeenLastCalledWith(4);
    expect(store.getState().notesViewOpen).toBe(false);
  });
});
