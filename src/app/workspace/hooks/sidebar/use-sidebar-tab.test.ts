// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSidebarTab } from "./use-sidebar-tab";

const saved = vi.hoisted(() => new Map<string, string>());

vi.mock("@/features/settings/model/project-sidebar-tab", () => ({
  loadProjectSidebarTab: (cwd: string) => saved.get(cwd) ?? "sessions",
  saveProjectSidebarTab: (cwd: string, tab: string) => saved.set(cwd, tab),
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

function mount(cwd: { current: string }, inset: { current: boolean }, show = vi.fn()) {
  let result = {} as ReturnType<typeof useSidebarTab>;
  function Probe() {
    result = useSidebarTab(cwd.current, cwd, inset, show);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return {
    current: () => result,
    rerender: () => act(() => root.render(createElement(Probe))),
  };
}

afterEach(() => saved.clear());

describe("useSidebarTab", () => {
  it("remembers the tab per project and maps the Inbox to sessions", () => {
    const cwd = { current: "/a" };
    const view = mount(cwd, { current: false });

    act(() => view.current().setSidebarTab("files"));
    expect(view.current().sidebarTab).toBe("files");
    expect(saved.get("/a")).toBe("files");

    cwd.current = "/b";
    view.rerender();
    expect(view.current().sidebarTab).toBe("sessions");

    act(() => view.current().setSidebarTab("inbox"));
    expect(view.current().sidebarTab).toBe("sessions");
  });

  it("opens Explorer and Changes in the right panel under the inset layout", () => {
    const show = vi.fn();
    const view = mount({ current: "/a" }, { current: true }, show);

    act(() => view.current().setSidebarTab("changes"));

    expect(show).toHaveBeenCalledWith("changes");
    expect(saved.size).toBe(0);
    expect(view.current().sidebarTab).toBe("sessions");
  });
});
