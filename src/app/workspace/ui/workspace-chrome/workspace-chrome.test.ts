// @vitest-environment happy-dom
import { act, createElement, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectTerminalDock } from "@/features/projects/model/project-terminal";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { InsetRightPanel } from "./InsetRightPanel";
import { WorkspaceMenuBar } from "./WorkspaceMenuBar";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { WorkspaceUsageFooter } from "./WorkspaceUsageFooter";

type Seen = Record<string, unknown>;

const { seen, zoomUi } = vi.hoisted(() => ({
  seen: { menu: undefined as Seen | undefined, footer: undefined as Seen | undefined, settings: undefined as Seen | undefined },
  zoomUi: vi.fn(),
}));

vi.mock("../../../shell/MenuBar", () => ({
  MenuBar: (props: Seen) => {
    seen.menu = props;
    return null;
  },
}));
vi.mock("../../../shell/UsageFooter", () => ({
  UsageFooter: (props: Seen) => {
    seen.footer = props;
    return null;
  },
}));
vi.mock("../app-views/lazy-views", () => ({
  SettingsView: (props: Seen) => {
    seen.settings = props;
    return null;
  },
}));
vi.mock("../../hooks/commands/ui-zoom", () => ({ zoomUi }));

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;

function render<P extends object>(component: FunctionComponent<P>, props: P): void {
  act(() => root.render(createElement(component, props)));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
  seen.menu = undefined;
  seen.footer = undefined;
  seen.settings = undefined;
  zoomUi.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("WorkspaceMenuBar", () => {
  const menuProps = (onCloseTab = vi.fn()) =>
    ({ store, onCloseTab }) as unknown as Parameters<typeof WorkspaceMenuBar>[0];

  it("closes the active tab and offers nothing to close without one", () => {
    const onCloseTab = vi.fn();
    render(WorkspaceMenuBar, menuProps(onCloseTab));
    expect(seen.menu?.onCloseCurrentTab).toBeUndefined();

    act(() => store.setState({ activeTabId: "t1" }));
    const closeCurrent = seen.menu?.onCloseCurrentTab as () => void;
    closeCurrent();

    expect(onCloseTab).toHaveBeenCalledWith("t1");
  });

  it("zooms the app UI", () => {
    render(WorkspaceMenuBar, menuProps());
    const zoomIn = seen.menu?.onZoomIn as () => void;
    const zoomOut = seen.menu?.onZoomOut as () => void;
    const zoomReset = seen.menu?.onZoomReset as () => void;

    zoomIn();
    zoomOut();
    zoomReset();

    expect(zoomUi.mock.calls).toEqual([["zoom-in"], ["zoom-out"], ["zoom-reset"]]);
  });
});

describe("WorkspaceUsageFooter", () => {
  const footerProps = () =>
    ({
      store,
      providers: [],
      terminals: [{ id: "term" }],
      terminalOpen: true,
      onNewTerminal: vi.fn(),
      onToggleProjectTerminal: vi.fn(),
    }) as unknown as Parameters<typeof WorkspaceUsageFooter>[0];

  it("shows the current local project's terminals and dock state", () => {
    const dock = { projectPath: "/work/app", open: true, pane: { files: [{}] } };
    store.setState({
      projectCwd: "/work/app",
      projectTerminals: [dock as unknown as ProjectTerminalDock],
    });
    const props = footerProps();
    render(WorkspaceUsageFooter, props);

    expect(seen.footer).toMatchObject({
      project: "/work/app",
      terminals: props.terminals,
      terminalOpen: true,
      onNewTerminal: props.onNewTerminal,
      projectTerminalActive: true,
      projectTerminalOpen: true,
    });
  });

  it("drops the terminals under a Familiar in full view", () => {
    store.setState({ projectCwd: "/work/app", familiarViewId: "familiar-1" });
    render(WorkspaceUsageFooter, { ...footerProps(), project: "/work/familiar" });

    expect(seen.footer).toMatchObject({
      project: "/work/familiar",
      terminals: undefined,
      terminalOpen: false,
      onNewTerminal: undefined,
      onToggleProjectTerminal: undefined,
      projectTerminalActive: false,
      projectTerminalOpen: false,
    });
  });
});

describe("WorkspaceSettings", () => {
  it("renders only while Settings is open, with its section and rail mode from the store", () => {
    const onRemoveProject = vi.fn();
    const props = { store, onRemoveProject } as unknown as Parameters<typeof WorkspaceSettings>[0];
    render(WorkspaceSettings, props);
    expect(seen.settings).toBeUndefined();

    act(() => store.setState({ settingsOpen: true, settingsSection: "providers" }));
    expect(seen.settings).toMatchObject({ section: "providers", besideRail: true });

    const deleteProject = seen.settings?.onDeleteProject as (path: string) => void;
    const changeRailMode = seen.settings?.onCollapsedProjectRailModeChange as (mode: string) => void;
    deleteProject("/work/app");
    act(() => changeRailMode("compact"));

    expect(onRemoveProject).toHaveBeenCalledWith("/work/app", { purgeData: true });
    expect(store.getState().collapsedProjectRailMode).toBe("compact");
  });
});

describe("InsetRightPanel", () => {
  it("hides until shown and keeps a closing panel inert", () => {
    const resize = { width: 280, dragging: false } as Parameters<typeof InsetRightPanel>[0]["resize"];
    const panel = { resize, onPane: vi.fn(), onHost: vi.fn() };
    render(InsetRightPanel, { ...panel, shown: false, closing: false });
    expect((container.firstChild as HTMLElement).className).toBe("hidden");

    render(InsetRightPanel, { ...panel, shown: true, closing: true });
    expect((container.firstChild as HTMLElement).className).toContain("border-l");
    expect((container.firstChild as HTMLElement).hasAttribute("inert")).toBe(true);
    expect(container.querySelector('[role="separator"]')?.getAttribute("aria-valuenow")).toBe("280");
  });
});
