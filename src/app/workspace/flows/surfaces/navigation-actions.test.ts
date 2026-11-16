// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { boardFocus } from "@/features/task-board/model/board-focus";
import { confirmReload } from "../../../model/app-lifecycle";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { navigateSessionList, type SessionListDeps } from "../tabs/session-list-navigation";
import { createNavigationActions, type NavigationActionsDeps } from "./navigation-actions";

vi.mock("../../../model/app-lifecycle", () => ({ confirmReload: vi.fn() }));
vi.mock("../tabs/session-list-navigation", () => ({ navigateSessionList: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function setup() {
  const store = createWorkspaceStore(testWorkspaceState());
  const flags = { inset: false, dirty: false };
  const sessionList = { navigationIds: { current: [] as readonly string[] } } as unknown as SessionListDeps;
  const deps = {
    store,
    insetLayout: () => flags.inset,
    rightPanelToggle: vi.fn<() => (() => void) | null>(() => null),
    hasDirtyFiles: () => flags.dirty,
    reload: vi.fn(),
    sessionList,
    project: { currentProject: () => "/nowhere", selectProject: vi.fn(), noteStep: vi.fn() },
    openLocalSurface: vi.fn(),
  } satisfies NavigationActionsDeps;
  return { store, flags, deps, actions: createNavigationActions(deps) };
}

describe("createNavigationActions", () => {
  it("reads the inset layout at call time for the primary sidebar toggle", () => {
    const { store, flags, actions } = setup();

    actions.toggleSidebar();
    expect(store.getState().projectRailOpen).toBe(false);
    expect(store.getState().sessionSidebarOpen).toBe(true);

    flags.inset = true;
    actions.toggleSidebar();
    expect(store.getState().sessionSidebarOpen).toBe(false);
  });

  it("sends the sidebar shortcut to the current right panel toggle in the inset layout", () => {
    const { store, flags, deps, actions } = setup();
    const panel = vi.fn();
    deps.rightPanelToggle.mockReturnValue(panel);

    flags.inset = true;
    actions.toggleSessionSidebarShortcut();
    expect(panel).toHaveBeenCalledOnce();
    expect(store.getState().sessionSidebarOpen).toBe(true);

    flags.inset = false;
    actions.toggleSessionSidebarShortcut();
    expect(store.getState().sessionSidebarOpen).toBe(false);
  });

  it("reloads only after the unsaved files prompt agrees", async () => {
    const { flags, deps, actions } = setup();
    flags.dirty = true;
    vi.mocked(confirmReload).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    actions.reload();
    await vi.waitFor(() => expect(confirmReload).toHaveBeenCalledWith(true));
    expect(deps.reload).not.toHaveBeenCalled();

    actions.reload();
    await vi.waitFor(() => expect(deps.reload).toHaveBeenCalledOnce());
  });

  it("records the sidebar order and steps through it", () => {
    const { deps, actions } = setup();

    actions.setSessionNavigationOrder(["a", "b"]);
    actions.navigateSessionList(1);
    actions.navigateSessionList(-1, true);

    expect(deps.sessionList.navigationIds.current).toEqual(["a", "b"]);
    expect(navigateSessionList).toHaveBeenNthCalledWith(1, deps.sessionList, 1, false);
    expect(navigateSessionList).toHaveBeenNthCalledWith(2, deps.sessionList, -1, true);
  });

  it("opens the board with the card focused, and the usage surface", () => {
    const { deps, actions } = setup();

    actions.openBoardCard("card-1");
    actions.openUsage();

    expect(boardFocus()).toBe("card-1");
    expect(deps.openLocalSurface).toHaveBeenNthCalledWith(1, "board");
    expect(deps.openLocalSurface).toHaveBeenNthCalledWith(2, "usage");
  });

  it("leaves the project alone when the current one is not in the rail", () => {
    const { deps, actions } = setup();

    actions.navigateProjectList(1);

    expect(deps.project.selectProject).not.toHaveBeenCalled();
  });
});
