// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadProjectRailOpen, loadSessionSidebarOpen } from "@/features/settings/model/appearance";
import { loadRecents, projectRailItems, rememberProject } from "@/features/projects/model/recents";
import { boardFocus } from "@/features/task-board/model/board-focus";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { openBoardCard } from "./board-surface";
import { stepProject } from "./project-navigation";
import { toggleProjectRail, togglePrimarySidebar, toggleSessionSidebar, toggleSessionSidebarShortcut } from "./sidebar-toggles";

beforeEach(() => localStorage.clear());

describe("sidebar toggles", () => {
  it("toggles the session sidebar and remembers it", () => {
    const store = createWorkspaceStore(testWorkspaceState());

    toggleSessionSidebar(store);

    expect(store.getState().sessionSidebarOpen).toBe(false);
    expect(loadSessionSidebarOpen()).toBe(false);

    toggleSessionSidebar(store);

    expect(store.getState().sessionSidebarOpen).toBe(true);
  });

  it("toggles the project rail and remembers it", () => {
    const store = createWorkspaceStore(testWorkspaceState());

    toggleProjectRail(store);

    expect(store.getState().projectRailOpen).toBe(false);
    expect(loadProjectRailOpen()).toBe(false);
  });

  it("gives the primary toggle to the rail, or to the sidebar in the inset layout", () => {
    const store = createWorkspaceStore(testWorkspaceState());

    togglePrimarySidebar(store, false);
    expect(store.getState().projectRailOpen).toBe(false);
    expect(store.getState().sessionSidebarOpen).toBe(true);

    togglePrimarySidebar(store, true);
    expect(store.getState().sessionSidebarOpen).toBe(false);
    expect(store.getState().projectRailOpen).toBe(false);
  });

  it("sends the sidebar shortcut to the right panel only in the inset layout", () => {
    const store = createWorkspaceStore(testWorkspaceState());
    const panel = vi.fn();

    toggleSessionSidebarShortcut(store, true, panel);
    expect(panel).toHaveBeenCalledOnce();
    expect(store.getState().sessionSidebarOpen).toBe(true);

    toggleSessionSidebarShortcut(store, true, null);
    expect(store.getState().sessionSidebarOpen).toBe(true);

    toggleSessionSidebarShortcut(store, false, panel);
    expect(panel).toHaveBeenCalledOnce();
    expect(store.getState().sessionSidebarOpen).toBe(false);
  });
});

describe("stepProject", () => {
  it("selects the neighbouring project in rail order and notes the step", () => {
    rememberProject("/work/a");
    rememberProject("/work/b");
    const paths = projectRailItems(loadRecents(), "/work/a").map((project) => project.path);
    const selectProject = vi.fn();
    const noteStep = vi.fn();

    stepProject({ currentProject: () => paths[0], selectProject, noteStep }, 1);

    expect(selectProject).toHaveBeenCalledWith(paths[1]);
    expect(noteStep).toHaveBeenCalledWith(paths[1], 1);
  });

  it("stays put when the current project is not in the rail", () => {
    const selectProject = vi.fn();

    stepProject({ currentProject: () => "/nowhere", selectProject, noteStep: vi.fn() }, 1);

    expect(selectProject).not.toHaveBeenCalled();
  });
});

describe("openBoardCard", () => {
  it("asks the board to focus the card, then opens the board", () => {
    const open = vi.fn();

    openBoardCard(open, "card-1");

    expect(boardFocus()).toBe("card-1");
    expect(open).toHaveBeenCalledWith("board");
  });
});
