// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore } from "../store/create-workspace-store";
import { testWorkspaceState } from "../store/test-state";
import type { WorkspaceStore } from "../store/types";
import { fakeWorkspaceHandlers, withWorkspaceHandlers } from "../testing/workspace-handlers";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

const { seen } = vi.hoisted(() => ({
  seen: { props: undefined as Record<string, unknown> | undefined },
}));

vi.mock("../../shell/Sidebar", () => ({
  Sidebar: (props: Record<string, unknown>) => {
    seen.props = props;
    return null;
  },
}));

type Props = ComponentProps<typeof WorkspaceSidebar>;

const rightPanel = {
  host: null,
  open: true,
  tab: "files",
  onTabChange: () => {},
} as unknown as Props["rightPanel"];

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;

function mount(overrides: Partial<Props> = {}, handlers = fakeWorkspaceHandlers()): void {
  const props = {
    store,
    inset: false,
    automationsViewOpen: false,
    tab: "files",
    rightPanel,
    localSurfaces: { active: null, visible: {}, onOpen: () => {}, badges: {} },
    ...overrides,
  } as unknown as Props;
  act(() => root.render(withWorkspaceHandlers(createElement(WorkspaceSidebar, props), handlers)));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
  seen.props = undefined;
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("WorkspaceSidebar", () => {
  it("opens with the store's sidebar and rail state in the classic layout", () => {
    store.setState({
      sessionSidebarOpen: true,
      projectRailOpen: true,
      collapsedProjectRailMode: "compact",
    });
    mount();

    expect(seen.props?.open).toBe(true);
    expect(seen.props?.tab).toBe("files");
    expect(seen.props?.projectRailOpen).toBe(true);
    expect(seen.props?.compactProjectRail).toBe(true);
    expect(seen.props?.rightPanel).toBeUndefined();
  });

  it("closes beside a local surface in the classic layout only", () => {
    store.setState({ sessionSidebarOpen: true });
    const localSurfaces = { active: "knowledge", visible: {}, onOpen: () => {}, badges: {} };

    mount({ localSurfaces } as Partial<Props>);
    expect(seen.props?.open).toBe(false);

    mount({ localSurfaces, inset: true } as Partial<Props>);
    expect(seen.props?.open).toBe(true);
  });

  it("keeps the inset layout on sessions with the right panel and no rail", () => {
    store.setState({ projectRailOpen: true, collapsedProjectRailMode: "compact" });
    mount({ inset: true });

    expect(seen.props?.tab).toBe("sessions");
    expect(seen.props?.rightPanel).toBe(rightPanel);
    expect(seen.props?.projectRailOpen).toBe(false);
    expect(seen.props?.compactProjectRail).toBe(false);
  });

  it("drops the right panel under Settings or a Familiar in view", () => {
    store.setState({ settingsOpen: true });
    mount({ inset: true });
    expect(seen.props?.rightPanel).toBeUndefined();

    act(() => store.setState({ settingsOpen: false, familiarViewId: "f1" }));
    mount({ inset: true });
    expect(seen.props?.rightPanel).toBeUndefined();
    expect(seen.props?.familiarViewActive).toBe(true);
  });

  it("goes back from any open view or a visited tab", () => {
    mount();
    expect(seen.props?.canGoBack).toBe(false);

    mount({ automationsViewOpen: true });
    expect(seen.props?.canGoBack).toBe(true);

    act(() =>
      store.setState({ tabVisitNav: { canBack: false, canForward: true }, inboxViewOpen: true }),
    );
    mount();
    expect(seen.props?.canGoBack).toBe(true);
    expect(seen.props?.canGoForward).toBe(true);
    expect(seen.props?.inboxActive).toBe(true);
  });

  it("writes files search and the dismissed update notice to the store", () => {
    store.setState({ updateNotice: { version: "1.0.21" } as never });
    mount();
    expect(seen.props?.updateNotice).toEqual({ version: "1.0.21" });

    const setFilesSearchOpen = seen.props?.onFilesSearchOpenChange as (open: boolean) => void;
    const dismiss = seen.props?.onDismissUpdate as () => void;
    act(() => setFilesSearchOpen(true));
    act(() => dismiss());

    expect(store.getState().filesSearchOpen).toBe(true);
    expect(store.getState().updateNotice).toBeNull();
    expect(seen.props?.filesSearchOpen).toBe(true);
  });

  it("takes its callbacks from the workspace handlers, notes only when enabled", () => {
    const handlers = fakeWorkspaceHandlers();
    mount({ notesEnabled: false }, handlers);

    expect(seen.props?.onOpenFile).toBe(handlers.files.open);
    expect(seen.props?.onSelectSession).toBe(handlers.sessionOpeners.selectHistory);
    expect(seen.props?.onPrefetchSession).toBe(handlers.prefetchSession);
    expect(seen.props?.onOpenNotes).toBeUndefined();

    mount({ notesEnabled: true }, handlers);
    expect(seen.props?.onOpenNotes).toBe(handlers.surfaces.openNotes);
  });
});
