// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { useIsolatedTerminalPanes, useTabVisitsSync } from "./use-tab-effects";

const mocks = vi.hoisted(() => ({ isolate: vi.fn((tab: { id: string }) => tab) }));

vi.mock("@/features/workspace/model/layout", () => ({ isolateTerminalPanes: mocks.isolate }));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

function mount(hook: () => void) {
  function Probe() {
    hook();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return () => act(() => root.render(createElement(Probe)));
}

const tab = (id: string) => ({ id }) as WorkspaceTab;

afterEach(() => vi.clearAllMocks());

describe("useIsolatedTerminalPanes", () => {
  it("keeps the tab list when nothing moves", () => {
    const tabs = [tab("a")];
    const store = createWorkspaceStore(testWorkspaceState({ tabs }));
    mount(() => useIsolatedTerminalPanes(store, store.getState().tabs));

    expect(store.getState().tabs).toBe(tabs);
  });

  it("writes the tabs whose terminals moved out", () => {
    const moved = tab("a2");
    mocks.isolate.mockImplementation((current) => (current.id === "a" ? moved : current));
    const other = tab("b");
    const store = createWorkspaceStore(testWorkspaceState({ tabs: [tab("a"), other] }));
    mount(() => useIsolatedTerminalPanes(store, store.getState().tabs));

    expect(store.getState().tabs).toEqual([moved, other]);
  });
});

describe("useTabVisitsSync", () => {
  it("records the active tab among the open ones on each change", () => {
    const visits = { sync: vi.fn() };
    let active = "a";
    const tabs = [tab("a"), tab("b")];
    const rerender = mount(() => useTabVisitsSync(visits, tabs, active));
    rerender();
    active = "b";
    rerender();

    expect(visits.sync.mock.calls).toEqual([
      [new Set(["a", "b"]), "a"],
      [new Set(["a", "b"]), "b"],
    ]);
  });
});
