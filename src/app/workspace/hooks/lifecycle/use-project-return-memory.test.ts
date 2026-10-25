// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { ProjectReturnMemory } from "@/features/projects/model/project-return";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import {
  type ProjectReturn,
  useProjectReturnMemory,
} from "./use-project-return-memory";

const reconcile = vi.hoisted(() =>
  vi.fn(({ memory, activeTabId }: { memory: ProjectReturnMemory; activeTabId: string }) =>
    new Map([...memory, [`/p/${activeTabId}`, activeTabId]]),
  ),
);

vi.mock("@/features/projects/model/project-return", () => ({ reconcileProjectReturn: reconcile }));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => vi.clearAllMocks());

function mount(initial: ProjectReturnMemory | undefined) {
  const tabsRef = { current: [] as WorkspaceTab[] };
  const sessionsRef = { current: [] as Session[] };
  const activeTabIdRef = { current: "a" };
  const result: { current?: ProjectReturn } = {};

  function Probe() {
    result.current = useProjectReturnMemory({
      initial,
      tabs: tabsRef.current,
      sessions: sessionsRef.current,
      activeTabId: activeTabIdRef.current,
      tabsRef,
      sessionsRef,
      activeTabIdRef,
    });
    return null;
  }

  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  const rerender = () => act(() => root.render(createElement(Probe)));
  return { result, rerender, activeTabIdRef, tabsRef };
}

describe("useProjectReturnMemory", () => {
  it("seeds from the resumed memory and reconciles it after mount", () => {
    const { result } = mount(new Map([["/old", "x"]]));

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile.mock.calls[0]?.[0]).toMatchObject({ memory: new Map([["/old", "x"]]), activeTabId: "a" });
    expect(result.current?.ref.current).toEqual(new Map([["/old", "x"], ["/p/a", "a"]]));
  });

  it("reconciles again only when the active tab, tabs or chats change", () => {
    const { rerender, activeTabIdRef, tabsRef } = mount(undefined);
    rerender();
    expect(reconcile).toHaveBeenCalledTimes(1);

    activeTabIdRef.current = "b";
    rerender();
    tabsRef.current = [];
    rerender();

    expect(reconcile).toHaveBeenCalledTimes(3);
  });

  it("read reconciles from the latest refs and keeps a stable identity", () => {
    const { result, rerender, activeTabIdRef } = mount(undefined);
    const first = result.current?.read;
    activeTabIdRef.current = "c";
    rerender();

    expect(result.current?.read).toBe(first);
    expect(result.current?.read().get("/p/c")).toBe("c");
  });
});
