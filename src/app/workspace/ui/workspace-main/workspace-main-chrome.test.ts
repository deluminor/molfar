// @vitest-environment happy-dom
import { act, createElement, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectTerminalDock } from "@/features/projects/model/project-terminal";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { fakeWorkspaceHandlers, withWorkspaceHandlers } from "../../testing/workspace-handlers";
import { LinkedWorkItemPanels } from "./LinkedWorkItemPanels";
import { ProjectTerminalDocks } from "./ProjectTerminalDocks";

type Seen = Record<string, unknown>;

const { seen } = vi.hoisted(() => ({
  seen: { docks: [] as Seen[], panels: [] as Seen[] },
}));

vi.mock("@/features/terminal/ui/ProjectTerminalDock", () => ({
  ProjectTerminalDock: (props: Seen) => {
    seen.docks.push(props);
    return null;
  },
}));
vi.mock("../app-views/lazy-views", () => ({
  LinkedWorkItemPanel: (props: Seen) => {
    seen.panels.push(props);
    return null;
  },
}));

const dock = (projectPath: string, open: boolean) =>
  ({ projectPath, open, pane: { files: [] } }) as unknown as ProjectTerminalDock;

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
  seen.docks = [];
  seen.panels = [];
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("ProjectTerminalDocks", () => {
  const dockProps = (closingShown = false) => ({
    store,
    closingShown,
    onSizePaint: vi.fn(),
    onSizeCommit: vi.fn(),
  });

  function shown(): (string | undefined)[] {
    return [...container.querySelectorAll("[data-dock-shown]")].map(
      (element) => (element as HTMLElement).style.gridArea,
    );
  }

  it("shows only the current project's open dock, focused with the terminal", () => {
    store.setState({
      projectCwd: "/work/app",
      projectTerminals: [dock("/work/app", true), dock("/work/other", true)],
      projectTerminalFocused: true,
    });
    render(ProjectTerminalDocks, dockProps());

    expect(shown()).toEqual(["dock"]);
    expect(seen.docks.slice(-2).map((props) => props.focused)).toEqual([true, false]);
    expect(seen.docks.at(-1)).toMatchObject({
      onFocus: handlers.terminals.focusDock,
      onCloseTerminal: handlers.terminals.close,
      onTerminalMetaChange: handlers.terminals.changeMeta,
    });
  });

  it("keeps a closing dock shown until its slide ends, and hides it behind a Familiar", () => {
    store.setState({ projectCwd: "/work/app", projectTerminals: [dock("/work/app", false)] });
    render(ProjectTerminalDocks, dockProps());
    expect(shown()).toEqual([]);

    render(ProjectTerminalDocks, dockProps(true));
    expect(shown()).toEqual(["dock"]);

    act(() => store.setState({ familiarViewId: "familiar-1" }));
    expect(shown()).toEqual([]);
  });
});

describe("LinkedWorkItemPanels", () => {
  const panel = (sessionId: string) => ({ sessionId, item: { id: sessionId }, cwd: "/work/app" });

  it("shows the panel of the shown session and closes it before opening another session", () => {
    store.setState({
      linkedWorkItemPanels: new Map([
        ["s1", panel("s1")],
        ["s2", panel("s2")],
      ]) as never,
    });
    render(LinkedWorkItemPanels, { store, shownSessionId: "s2" });
    const onClosePanel = handlers.linkedPanels.close;
    const onOpenSession = handlers.inbox.openSession;

    const [first, second] = seen.panels.slice(-2);
    expect(first?.visible).toBe(false);
    expect(second?.visible).toBe(true);

    const openFromSecond = second?.onOpenSession as (id: string) => void;
    const closeFirst = first?.onClose as () => void;

    openFromSecond("s9");
    expect(onClosePanel).toHaveBeenCalledWith("s2");
    expect(onOpenSession).toHaveBeenCalledWith("s9");
    closeFirst();
    expect(onClosePanel).toHaveBeenLastCalledWith("s1");
  });

  it("shows no panel while the workspace is covered", () => {
    store.setState({ linkedWorkItemPanels: new Map([["s1", panel("s1")]]) as never });
    render(LinkedWorkItemPanels, { store, shownSessionId: undefined });

    expect(seen.panels.at(-1)?.visible).toBe(false);
  });
});
