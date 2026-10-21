// @vitest-environment happy-dom
import { act, createElement, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { ProjectTerminalDock } from "@/features/projects/model/project-terminal";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { fakeWorkspaceHandlers, withWorkspaceHandlers } from "../../testing/workspace-handlers";
import { InsetRightPanel } from "./InsetRightPanel";
import { saveNotesEnabled } from "@/features/settings/model/settings";
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
let handlers: ReturnType<typeof fakeWorkspaceHandlers>;

function render<P extends object>(component: FunctionComponent<P>, props: P): void {
  act(() => root.render(withWorkspaceHandlers(createElement(component, props), handlers)));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
  handlers = fakeWorkspaceHandlers();
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
  const menuProps = (notesEnabled = false) => {
    saveNotesEnabled(notesEnabled);
    return { store };
  };

  it("closes the active tab and offers nothing to close without one", () => {
    render(WorkspaceMenuBar, menuProps());
    expect(seen.menu?.onCloseCurrentTab).toBeUndefined();

    act(() => store.setState({ activeTabId: "t1" }));
    const closeCurrent = seen.menu?.onCloseCurrentTab as () => void;
    closeCurrent();

    expect(handlers.tabClose.closeTab).toHaveBeenCalledWith("t1");
  });

  it("takes its menu commands from the workspace handlers, notes only when enabled", () => {
    render(WorkspaceMenuBar, menuProps());
    expect(seen.menu).toMatchObject({
      onNew: handlers.newSessions.newSession,
      onToggleSessionSidebar: handlers.navigation.toggleSessionSidebarShortcut,
      onPickProject: handlers.projects.pick,
      onOpenNotes: undefined,
    });

    render(WorkspaceMenuBar, menuProps(true));
    expect(seen.menu?.onOpenNotes).toBe(handlers.surfaces.openNotes);
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
  const vite = { id: "term", path: "Terminal", cwd: "/work/app", terminal: true, foreground: "vite" };
  const footerProps = (source?: Partial<Session>) =>
    ({
      store,
      source: source && { blocks: [], ...source },
      activeTab: undefined,
    }) as unknown as Parameters<typeof WorkspaceUsageFooter>[0];

  it("shows the session's plan usage and the current local project's running terminals", () => {
    const dock = { projectPath: "/work/app", open: true, pane: { files: [vite] } };
    store.setState({
      projectCwd: "/work/app",
      projectTerminals: [dock as unknown as ProjectTerminalDock],
    });
    const props = footerProps({ id: "s1", harness: "claude", model: "opus" });
    render(WorkspaceUsageFooter, props);

    expect(seen.footer).toMatchObject({
      providers: ["claude"],
      session: { id: "s1", harness: "claude", model: "opus", authRequired: false },
      project: "/work/app",
      terminals: [{ id: "term", process: "vite" }],
      terminalOpen: true,
      onNewTerminal: handlers.terminals.openNew,
      onToggleProjectTerminal: handlers.terminals.toggleDock,
      onSelectAccount: handlers.providerAccounts.select,
      projectTerminalActive: true,
      projectTerminalOpen: true,
    });
  });

  it("drops the terminals under a Familiar in full view and follows the Familiar's project", () => {
    const dock = { projectPath: "/work/app", open: true, pane: { files: [vite] } };
    store.setState({
      projectCwd: "/work/app",
      projectTerminals: [dock as unknown as ProjectTerminalDock],
      familiarViewId: "familiar-1",
    });
    render(WorkspaceUsageFooter, footerProps({ id: "familiar-1", harness: "pi", cwd: "/work/familiar" }));

    expect(seen.footer).toMatchObject({
      providers: [],
      project: "/work/familiar",
      terminals: undefined,
      terminalOpen: false,
      onNewTerminal: undefined,
      onToggleProjectTerminal: undefined,
      projectTerminalActive: false,
      projectTerminalOpen: false,
    });
  });

  it("keeps the usage session while only the session object changes", () => {
    const blocks: never[] = [];
    render(WorkspaceUsageFooter, footerProps({ id: "s1", harness: "codex", blocks }));
    const first = seen.footer?.session;

    render(WorkspaceUsageFooter, footerProps({ id: "s1", harness: "codex", blocks }));

    expect(seen.footer?.session).toBe(first);
  });
});

describe("WorkspaceSettings", () => {
  it("renders only while Settings is open, with its section and rail mode from the store", () => {
    const props = { store } as unknown as Parameters<typeof WorkspaceSettings>[0];
    render(WorkspaceSettings, props);
    expect(seen.settings).toBeUndefined();

    act(() => store.setState({ settingsOpen: true, settingsSection: "providers" }));
    expect(seen.settings).toMatchObject({ section: "providers", besideRail: true });

    const deleteProject = seen.settings?.onDeleteProject as (path: string) => void;
    const changeRailMode = seen.settings?.onCollapsedProjectRailModeChange as (mode: string) => void;
    deleteProject("/work/app");
    act(() => changeRailMode("compact"));

    expect(handlers.projects.remove).toHaveBeenCalledWith("/work/app", { purgeData: true });
    expect(seen.settings?.onClose).toBe(handlers.surfaces.closeSettings);
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
