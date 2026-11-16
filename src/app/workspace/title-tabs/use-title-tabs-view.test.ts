// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { newTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { type TitleTabsView, useTitleTabsView } from "./use-title-tabs-view";

vi.mock("@/features/familiars/model/familiar", () => ({
  familiarForSession: (sessionId: string) => (sessionId === "fam-session" ? { id: "fam" } : undefined),
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const tab = { ...newTab("s"), id: "t" };
const sessions = [{ ...testSession("claude", "/work/demo"), id: "s" }];

type Input = Parameters<typeof useTitleTabsView>[0];
const base: Input = {
  deckProjectTabs: [tab],
  sessions,
  dirtyFiles: new Set(),
  unseenFinishedIds: new Set(),
  insetLayout: true,
  openAppViews: ["search"],
  notesEnabled: true,
  shownFamiliarTabs: [],
  sidebarCwd: "/work/demo",
  titleTabOrder: [],
  settingsOpen: false,
  familiarViewId: null,
  familiarsSnap: 1,
  activeAppView: undefined,
  activeTabId: "t",
  tabProjectsRef: { current: new Map() },
};

function mount(input: () => Input) {
  const results: TitleTabsView[] = [];
  function Probe() {
    results.push(useTitleTabsView(input()));
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return { results, rerender: () => act(() => root.render(createElement(Probe))) };
}

describe("useTitleTabsView", () => {
  it("lists the tabs, records their projects and keeps the list identity while it looks the same", () => {
    const tabProjectsRef = { current: new Map<string, string>() };
    const view = mount(() => ({ ...base, tabProjectsRef }));
    view.rerender();

    expect(view.results[0].titleTabs.map((entry) => entry.id)).toEqual(["t", "app-view:search"]);
    expect(view.results[1].titleTabs).toBe(view.results[0].titleTabs);
    expect(tabProjectsRef.current.has("t")).toBe(true);
    expect(view.results[0].displayedActiveId).toBe("t");
    expect(view.results[0].visibleTabs).toMatchObject({ insetLayout: true, activeTabId: "t", familiarTabId: undefined });
  });

  it("shows a covering view or Familiar as active, and nothing under Settings", () => {
    const shown = (input: Partial<Input>) => mount(() => ({ ...base, ...input })).results[0];

    expect(shown({ activeAppView: "search" }).displayedActiveId).toBe("app-view:search");
    const familiar = shown({ familiarViewId: "fam-session", activeAppView: "search" });
    expect(familiar.displayedActiveId).toBe("familiar:fam");
    expect(familiar.visibleTabs.familiarTabId).toBe("familiar:fam");
    expect(shown({ familiarViewId: "unknown" }).displayedActiveId).toBe("");
    expect(shown({ settingsOpen: true, activeAppView: "search" }).displayedActiveId).toBe("");
  });
});
