// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REMOTE_HISTORY_UPDATED } from "@/features/connections/model/connections";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import {
  useProjectFilePrefetch,
  useProjectHistory,
  useRemoteHistoryRerender,
} from "./use-project-data-effects";

const mocks = vi.hoisted(() => ({
  prefetch: vi.fn(),
  refresh: vi.fn(async () => undefined),
}));

vi.mock("@/features/files/model/file-index", () => ({ prefetchProjectFiles: mocks.prefetch }));
vi.mock("../../flows/session-history/refresh-history", () => ({
  refreshProjectHistory: mocks.refresh,
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

function mount(hook: () => void) {
  function Probe() {
    hook();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return { root, rerender: () => act(() => root.render(createElement(Probe))) };
}

afterEach(() => vi.clearAllMocks());

describe("useRemoteHistoryRerender", () => {
  it("re-renders on each remote history update until unmounted", () => {
    let renders = 0;
    const { root } = mount(() => {
      renders += 1;
      useRemoteHistoryRerender();
    });

    act(() => window.dispatchEvent(new Event(REMOTE_HISTORY_UPDATED)));
    expect(renders).toBe(2);

    act(() => root.unmount());
    window.dispatchEvent(new Event(REMOTE_HISTORY_UPDATED));
    expect(renders).toBe(2);
  });
});

describe("useProjectHistory", () => {
  it("refreshes the sidebar project's history when it changes and keeps one refresher", () => {
    const store = createWorkspaceStore(testWorkspaceState());
    let cwd = "/a";
    const cwdRef = { current: cwd };
    const refreshers = new Set<unknown>();
    const { rerender } = mount(() => {
      refreshers.add(useProjectHistory(store, cwd, cwdRef));
    });
    rerender();
    cwd = "/b";
    cwdRef.current = cwd;
    rerender();

    expect(mocks.refresh.mock.calls.map(([, path]) => path)).toEqual(["/a", "/b"]);
    expect(refreshers.size).toBe(1);
    const deps = mocks.refresh.mock.calls[0][2] as { sidebarCwd(): string };
    expect(deps.sidebarCwd()).toBe("/b");
  });
});

describe("useProjectFilePrefetch", () => {
  it("prefetches when the git folder changes", () => {
    let gitCwd = "/a";
    const { rerender } = mount(() => useProjectFilePrefetch(gitCwd));
    rerender();
    gitCwd = "/b";
    rerender();

    expect(mocks.prefetch.mock.calls).toEqual([["/a"], ["/b"]]);
  });
});
