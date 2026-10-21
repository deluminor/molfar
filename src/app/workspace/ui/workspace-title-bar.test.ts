// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { Familiar } from "@/features/familiars/model/familiar";
import { createWorkspaceStore } from "../store/create-workspace-store";
import { testWorkspaceState } from "../store/test-state";
import type { WorkspaceStore } from "../store/types";
import { WorkspaceTitleBar } from "./WorkspaceTitleBar";

const { seen, diffStats } = vi.hoisted(() => ({
  seen: { props: undefined as Record<string, unknown> | undefined },
  diffStats: vi.fn(),
}));

vi.mock("../../shell/TitleBar", () => ({
  TitleBar: (props: Record<string, unknown>) => {
    seen.props = props;
    return null;
  },
}));
vi.mock("@/features/source-control/hooks/use-project-diff-stats", () => ({
  useProjectDiffStats: diffStats,
}));
vi.mock("@/features/familiars/model/familiar", () => ({
  familiarLook: (familiar: Familiar) => ({ name: familiar.id }),
  familiarState: () => "idle",
}));

type Props = ComponentProps<typeof WorkspaceTitleBar>;

const tab = { id: "t1" } as unknown as Props["tabs"][number];
const familiar = { id: "f1" } as unknown as Familiar;
const familiarSession = { id: "f1" } as unknown as Session;

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;

function props(overrides: Partial<Props> = {}): Props {
  return {
    store,
    tabs: [tab],
    inset: false,
    cwd: "/work/app",
    gitCwd: "",
    familiar: undefined,
    familiarSession: undefined,
    familiarTabId: undefined,
    overviewShown: false,
    activeAppView: undefined,
    compactRail: false,
    showRightPanelToggle: false,
    rightPanelOpen: false,
    onToggleRightPanel: vi.fn(),
    onToggleFamiliarOverview: vi.fn(),
    onOpenFamiliarSettings: vi.fn(),
    onSettingsHeaderHost: vi.fn(),
    onNew: vi.fn(),
    onCloseFamiliarView: vi.fn(),
    onToggleSidebar: vi.fn(),
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onCloseMany: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  };
}

function mount(overrides: Partial<Props> = {}): Props {
  const all = props(overrides);
  act(() => root.render(createElement(WorkspaceTitleBar, all)));
  return all;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState({ activeTabId: "t1" }));
  seen.props = undefined;
  diffStats.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("WorkspaceTitleBar", () => {
  it("shows the project's tabs with the active tab from the store", () => {
    store.setState({
      projectRailOpen: true,
      sessionSidebarOpen: true,
      tabVisitNav: { canBack: true, canForward: false },
    });
    mount();

    expect(seen.props?.tabs).toEqual([tab]);
    expect(seen.props?.activeId).toBe("t1");
    expect(seen.props?.projectRailOpen).toBe(true);
    expect(seen.props?.sessionSidebarOpen).toBe(true);
    expect(seen.props?.canGoBack).toBe(true);
    expect(seen.props?.familiar).toBeUndefined();
    expect(seen.props?.onNewSession).toBeUndefined();
  });

  it("hides the project's tabs behind a Familiar in full view", () => {
    store.setState({ familiarViewId: "f1", familiarOverviewOpen: true });
    const all = mount({ familiar, familiarSession, overviewShown: true });

    expect(seen.props?.tabs).toEqual([]);
    expect(seen.props?.activeId).toBe("");
    expect(seen.props?.canGoBack).toBe(true);
    expect(seen.props?.hideWindowControls).toBe(true);
    expect(seen.props?.familiar).toEqual({ look: { name: "f1" }, state: "idle" });
    expect(seen.props?.onToggleFamiliarOverview).toBe(all.onToggleFamiliarOverview);
    expect(seen.props?.onOpenFamiliarSettings).toBe(all.onOpenFamiliarSettings);
  });

  it("keeps the Familiar as one of the inset layout's tabs", () => {
    store.setState({ familiarViewId: "f1" });
    mount({ inset: true, familiar, familiarSession, familiarTabId: "familiar:f1" });

    expect(seen.props?.tabs).toEqual([tab]);
    expect(seen.props?.activeId).toBe("familiar:f1");
    expect(seen.props?.onToggleFamiliarOverview).toBeUndefined();
    expect(seen.props?.onOpenFamiliarSettings).toBeUndefined();
  });

  it("marks an open app view as the inset layout's active tab", () => {
    mount({ inset: true, activeAppView: "inbox" });

    expect(seen.props?.activeId).toBe("app-view:inbox");
    expect(seen.props?.rightPanelUnavailable).toBe(true);
  });

  it("dots the right panel toggle while the project has changes", () => {
    diffStats.mockReturnValue({ files: 2 });
    const all = mount({ inset: true, showRightPanelToggle: true, gitCwd: "/work/app-wt" });

    expect(diffStats).toHaveBeenCalledWith("/work/app-wt", true);
    expect(seen.props?.rightPanelDot).toBe(true);
    expect(seen.props?.onToggleRightPanel).toBe(all.onToggleRightPanel);
  });

  it("closes the Familiar in view before a new session from the inset title bar", () => {
    store.setState({ familiarViewId: "f1" });
    const all = mount({ inset: true });

    const onNewSession = seen.props?.onNewSession as () => void;
    onNewSession();

    expect(all.onCloseFamiliarView).toHaveBeenCalled();
    expect(all.onNew).toHaveBeenCalled();
  });

  it("hosts the Settings header in the inset title bar", () => {
    store.setState({ settingsOpen: true });
    mount({ inset: true });

    expect(seen.props?.content).toBeTruthy();
    expect(seen.props?.onNewSession).toBeUndefined();
  });
});
