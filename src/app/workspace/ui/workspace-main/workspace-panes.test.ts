// @vitest-environment happy-dom
import { act, createElement, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { Familiar } from "@/features/familiars/model/familiar";
import { newTab, splitPane } from "@/features/workspace/model/layout";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { FamiliarSessionPanes } from "./FamiliarSessionPanes";
import type { SharedPaneProps } from "./types";
import { WorkspaceTabPanes } from "./WorkspaceTabPanes";

type Seen = Record<string, unknown>;

const { seen } = vi.hoisted(() => ({
  seen: { trees: [] as Seen[], panes: [] as Seen[], actions: [] as Seen[] },
}));

vi.mock("@/features/workspace/ui/PaneTree", () => ({
  PaneTree: (props: Seen) => {
    seen.trees.push(props);
    return null;
  },
}));
vi.mock("@/features/sessions/ui/SessionPane", () => ({
  SessionPane: (props: Seen) => {
    seen.panes.push(props);
    return null;
  },
}));
vi.mock("../../../shell/TitleBar", () => ({
  FamiliarViewActions: (props: Seen) => {
    seen.actions.push(props);
    return null;
  },
}));
vi.mock("@/features/familiars/model/familiar", () => ({
  isFamiliarSession: (id: string) => id.startsWith("familiar"),
  familiarLook: (familiar: Familiar) => ({ name: familiar.id }),
}));

const paneProps = { recents: [] } as unknown as SharedPaneProps;
const session = (id: string) => ({ id }) as unknown as Session;

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;

function render<P extends object>(component: FunctionComponent<P>, props: P): void {
  act(() => root.render(createElement(component, props)));
}

function lastOf(list: Seen[]): Seen | undefined {
  return list[list.length - 1];
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
  seen.trees = [];
  seen.panes = [];
  seen.actions = [];
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("WorkspaceTabPanes", () => {
  const tabProps = () =>
    ({
      store,
      paneProps,
      sessions: [],
      activeSessionId: "s1",
      composerFocused: true,
      onSelectFile: vi.fn(),
      onCloseFile: vi.fn(),
      onCloseOtherFiles: vi.fn(),
      onPinFile: vi.fn(),
      onReorderFiles: vi.fn(),
      onFileDirtyChange: vi.fn(),
      onUpdatePlan: vi.fn(),
      onMovePane: vi.fn(),
      onDetachPane: vi.fn(),
    }) as Parameters<typeof WorkspaceTabPanes>[0];

  it("shows and focuses only the active tab", () => {
    const first = newTab("s1");
    const second = newTab("s2");
    store.setState({ tabs: [first, second], activeTabId: first.id });

    render(WorkspaceTabPanes, tabProps());

    const [active, hidden] = seen.trees.slice(-2);
    expect(active).toMatchObject({ visible: true, focusedId: "s1", addToChatSessionId: "s1" });
    expect(active?.composerFocused).toBe(true);
    expect(hidden).toMatchObject({ visible: false, focusedId: "", addToChatSessionId: undefined });
    expect(container.querySelector(`[data-workspace-tab="${second.id}"]`)?.className).toBe("hidden");
  });

  it("hides every tab behind a Familiar and drops focus to the project terminal", () => {
    const tab = newTab("s1");
    store.setState({ tabs: [tab], activeTabId: tab.id, projectTerminalFocused: true });
    render(WorkspaceTabPanes, tabProps());
    expect(lastOf(seen.trees)).toMatchObject({ visible: true, focusedId: "", composerFocused: false });

    act(() => store.setState({ familiarViewId: "familiar-1", projectTerminalFocused: false }));
    expect(lastOf(seen.trees)?.visible).toBe(false);
    expect(container.querySelector("[data-workspace-tab]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("stores a split's new ratio on its tab", () => {
    const tab = { ...newTab("s1"), layout: splitPane(newTab("s1").layout, "s1", "right", "s2") };
    const splitId = tab.layout.type === "split" ? tab.layout.id : "";
    store.setState({ tabs: [tab], activeTabId: tab.id });
    render(WorkspaceTabPanes, tabProps());

    const onRatio = lastOf(seen.trees)?.onRatio as (id: string, i: number, r: number) => void;
    act(() => onRatio(splitId, 0, 0.3));

    const layout = store.getState().tabs[0]?.layout;
    expect(layout?.type === "split" ? layout.sizes[0] : undefined).toBeCloseTo(0.3);
  });
});

describe("FamiliarSessionPanes", () => {
  const familiar = { id: "f1" } as unknown as Familiar;
  const familiarProps = (overrides = {}) =>
    ({
      store,
      paneProps,
      sessions: [session("s1"), session("familiar-1"), session("familiar-2")],
      insetLayout: true,
      familiar,
      composerFocused: true,
      shownSessionActive: false,
      activityTurnId: "turn",
      launchedSessions: new Map(),
      ...overrides,
    }) as Parameters<typeof FamiliarSessionPanes>[0];

  it("renders each Familiar's chat and shows the one in view", () => {
    store.setState({ familiarViewId: "familiar-1" });
    render(FamiliarSessionPanes, familiarProps());

    const [shown, hidden] = seen.panes.slice(-2);
    expect(seen.panes.slice(-2).map((pane) => (pane.session as Session).id)).toEqual([
      "familiar-1",
      "familiar-2",
    ]);
    expect(shown).toMatchObject({ visible: true, focused: true, composerFocused: true });
    expect(shown?.familiarLaunchedSessions).toBeInstanceOf(Map);
    expect(hidden).toMatchObject({ visible: false, focused: false, familiarLaunchedSessions: undefined });
    expect(shown?.familiarComposerUsage).toBe(false);
  });

  it("hands focus to a launched session shown beside the chat", () => {
    store.setState({ familiarViewId: "familiar-1" });
    render(FamiliarSessionPanes, familiarProps({ shownSessionActive: true }));

    expect(seen.panes.at(-2)).toMatchObject({ focused: false, composerFocused: false });
  });

  it("toggles the overview and opens settings from the inset pane actions", () => {
    store.setState({ familiarViewId: "familiar-1", familiarOverviewOpen: false });
    render(FamiliarSessionPanes, familiarProps());

    const toggleOverview = lastOf(seen.actions)?.onToggleOverview as () => void;
    const openSettings = lastOf(seen.actions)?.onOpenSettings as () => void;

    act(() => toggleOverview());
    expect(store.getState().familiarOverviewOpen).toBe(true);
    expect(lastOf(seen.actions)?.overviewOpen).toBe(true);
    act(() => openSettings());
    expect(store.getState().familiarSettingsFor).toBe("f1");
  });

  it("leaves the pane actions to the title bar outside the inset layout", () => {
    store.setState({ familiarViewId: "familiar-1" });
    render(FamiliarSessionPanes, familiarProps({ insetLayout: false }));

    expect(seen.actions).toHaveLength(0);
  });
});
