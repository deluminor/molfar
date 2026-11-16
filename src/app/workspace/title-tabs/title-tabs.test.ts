import { describe, expect, it, vi } from "vitest";
import { newTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../store/create-workspace-store";
import { testWorkspaceState } from "../store/test-state";
import { createDisplayedTabs } from "./displayed-tabs";
import type { DisplayedTabsDeps, VisibleTabs } from "./displayed-tabs-deps";
import { titleTabList } from "./title-tab-list";
import { createVisibleTabShortcuts } from "./visible-tab-shortcuts";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  startTransition: (run: () => void) => run(),
}));

const blank = { ...newTab("s"), id: "t" };
const sessions = [{ ...testSession("claude", "/work/demo"), id: "s" }];

describe("titleTabList", () => {
  const base = {
    projectTabs: [blank],
    sessions,
    dirtyFiles: new Set<string>(),
    unseenFinishedIds: new Set<string>(),
    insetLayout: true,
    openAppViews: ["search" as const],
    notesEnabled: true,
    familiarTabs: [],
    sidebarCwd: "/work/demo",
    order: [],
  };

  it("lists workspace tabs, then open app views", () => {
    expect(titleTabList(base).map((tab) => tab.id)).toEqual(["t", "app-view:search"]);
  });

  it("hides the lone blank tab under a shown view tab", () => {
    expect(titleTabList({ ...base, shownViewTabId: "app-view:search" }).map((tab) => tab.id)).toEqual([
      "app-view:search",
    ]);
  });

  it("shows no view tabs in the classic layout", () => {
    expect(titleTabList({ ...base, insetLayout: false }).map((tab) => tab.id)).toEqual(["t"]);
  });
});

function setup(visible: Partial<VisibleTabs> = {}) {
  const store = createWorkspaceStore(testWorkspaceState());
  const workspace = {
    closeTitleTab: vi.fn(),
    closeTabs: vi.fn(),
    closeEveryTab: vi.fn(),
    reorderTabs: vi.fn(),
    closeFocused: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    activate: vi.fn(),
    closeOtherTabs: vi.fn(),
    closeAllTabs: vi.fn(),
  };
  const select = vi.fn();
  const deps = {
    store,
    navigation: {
      current: {
        tabs: [{ id: "t" }, { id: "app-view:search" }] as never,
        activeId: "app-view:search",
        select,
      },
    },
    visible: () => ({ insetLayout: true, activeTabId: "t", titleTabs: [], ...visible }),
    activeTabIdRef: { current: "t" },
    setOpenAppViews: vi.fn(),
    setOpenFamiliarTabs: vi.fn(),
    setTitleTabOrder: vi.fn(),
    setAutomationsViewOpen: vi.fn(),
    openFamiliar: vi.fn(),
    openAppView: vi.fn(),
    activateTab: vi.fn(),
    closeFamiliarView: vi.fn(),
    workspace,
  } satisfies DisplayedTabsDeps;
  const displayed = createDisplayedTabs(deps);
  return { deps, displayed, shortcuts: createVisibleTabShortcuts(deps, displayed), workspace, select };
}

describe("displayed tabs", () => {
  it("closes an app view tab and selects its neighbour", () => {
    const { deps, displayed, select } = setup();

    displayed.closeDisplayedTab("app-view:search");

    expect(deps.setOpenAppViews).toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith("t");
  });

  it("closes a workspace tab through the workspace", () => {
    const { displayed, workspace } = setup();

    displayed.closeDisplayedTab("t");

    expect(workspace.closeTitleTab).toHaveBeenCalledWith("t");
  });

  it("opens an app view tab when selected", () => {
    const { deps, displayed } = setup();

    displayed.selectTitleTab("app-view:inbox");

    expect(deps.openAppView).toHaveBeenCalledWith("inbox");
  });

  it("runs the classic layout's shortcuts over workspace tabs", () => {
    const { shortcuts, workspace } = setup({ insetLayout: false });

    shortcuts.cycleVisibleTab(1);
    shortcuts.cycleVisibleTab(-1);
    shortcuts.closeVisibleTab();

    expect(workspace.next).toHaveBeenCalled();
    expect(workspace.prev).toHaveBeenCalled();
    expect(workspace.closeFocused).toHaveBeenCalled();
  });

  it("cycles the inset layout's title tabs, wrapping around", () => {
    const { shortcuts, deps } = setup({
      activeAppView: "search",
      titleTabs: [{ id: "t" }, { id: "app-view:search" }] as never,
    });

    shortcuts.cycleVisibleTab(1);

    expect(deps.activateTab).toHaveBeenCalledWith("t");
  });
});
