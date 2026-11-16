// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { type WorkspaceChromeInput, workspaceChrome } from "./workspace-chrome";

vi.mock("@/shared/lib/platform", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  IS_MAC: true,
  HAS_NATIVE_GLASS: false,
}));

type Props = ComponentProps<typeof WorkspaceLayout>;

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;

const slot = (name: string) => createElement("i", { "data-slot": name });

function chrome(patch: Partial<WorkspaceChromeInput> = {}) {
  return workspaceChrome({
    isMac: true,
    insetLayout: false,
    searchViewOpen: false,
    settingsOpen: false,
    inboxViewOpen: false,
    notesViewOpen: false,
    automationsViewOpen: false,
    compactProjectRail: false,
    projectRailOpen: true,
    familiarCovers: false,
    rightPanelOpen: false,
    rightPanelClosing: false,
    activeAppView: undefined,
    sidebarCwd: "/work/app",
    ...patch,
  });
}

function mount(patch: Partial<Props> = {}): void {
  const insetLayout = patch.insetLayout ?? false;
  const props: Props = {
    store,
    insetLayout,
    chrome: chrome({ insetLayout }),
    titleBar: slot("title"),
    sidebar: slot("sidebar"),
    onInsetRailHost: () => {},
    dockGridRef: { current: null },
    docks: slot("docks"),
    panes: slot("panes"),
    linkedPanels: slot("linked"),
    familiarOverview: slot("overview"),
    familiarSettings: slot("familiarSettings"),
    appViews: slot("views"),
    settings: slot("settings"),
    usageFooter: slot("footer"),
    rightPanel: slot("right"),
    overlays: slot("overlays"),
    ...patch,
  };
  act(() => root.render(createElement(WorkspaceLayout, props)));
}

function order(): string[] {
  return [...container.querySelectorAll<HTMLElement>("[data-slot]")].map((el) => el.dataset.slot ?? "");
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("WorkspaceLayout", () => {
  it("lays the classic frame out flat with the title bar in the body", () => {
    mount();

    expect(order()).toEqual([
      "sidebar",
      "title",
      "docks",
      "panes",
      "linked",
      "overview",
      "familiarSettings",
      "views",
      "settings",
      "footer",
      "overlays",
    ]);
    expect(container.querySelector(".inset-rail-host")).toBeNull();
    expect(container.querySelector("main [data-slot=docks]")?.parentElement?.className).toContain("grid");
  });

  it("puts the inset title bar across the window, the sidebar in the rail and the footer under the card", () => {
    mount({ insetLayout: true });

    expect(order()).toEqual([
      "title",
      "sidebar",
      "docks",
      "panes",
      "linked",
      "overview",
      "familiarSettings",
      "views",
      "settings",
      "right",
      "footer",
      "overlays",
    ]);
    expect(container.querySelector(".inset-rail-host [data-slot=sidebar]")).not.toBeNull();
    expect(container.querySelector(".inset-card [data-slot=right]")).not.toBeNull();
  });

  it("keeps a spacer under the inset card without a footer, slimmer beside Settings", () => {
    mount({ insetLayout: true, usageFooter: null });
    expect(container.querySelector(".h-\\[30px\\]")).not.toBeNull();

    act(() => store.setState({ settingsOpen: true }));
    expect(container.querySelector(".h-1\\.5")).not.toBeNull();
  });

  it("hides the workspace body under an open view", () => {
    mount({ chrome: chrome({ searchViewOpen: true }) });

    const body = container.querySelector("main")?.closest("[aria-hidden]");
    expect(body?.getAttribute("aria-hidden")).toBe("true");
    expect(body?.className).toBe("hidden");
  });
});
