// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { rememberRemoteSession, remoteSessionFor } from "@/features/connections/model/connections";
import { REMOTE_PROJECT_PREFIX } from "@/features/projects/model/recents";
import { leafIds, newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../../store/create-workspace-store";
import { testWorkspaceState } from "../../../store/test-state";
import { createNewSessionActions, type NewSessionDeps } from "./new-session-actions";

const remote = `${REMOTE_PROJECT_PREFIX}box/work/demo`;

beforeEach(() => localStorage.clear());

function setup(sessions: Session[] = [], tabs: WorkspaceTab[] = []) {
  const store = createWorkspaceStore(
    testWorkspaceState({ sessions, tabs, searchViewOpen: true, inboxViewOpen: true, notesViewOpen: true }),
  );
  const view = {
    defaults: undefined as Session | undefined,
    activeTab: tabs[0] as WorkspaceTab | undefined,
    sidebarCwd: "/work/side",
  };
  const deps = {
    store,
    tabsRef: { current: tabs },
    sessionsRef: { current: sessions },
    defaults: () => view.defaults,
    activeTab: () => view.activeTab,
    sidebarCwd: () => view.sidebarCwd,
    projectCwd: () => "/work/project",
    setAutomationsViewOpen: vi.fn(),
    openSessionTab: vi.fn((session: Session) => ({ ...newTab(session.id), id: `tab-${session.id}` })),
    activateTab: vi.fn(),
    selectTab: vi.fn(),
    setComposerFocused: vi.fn(),
    closeFamiliarView: vi.fn(),
    terminals: { focusedDockTerminal: vi.fn((): string | null => null), openNew: vi.fn(), close: vi.fn() },
    closePane: vi.fn(),
  } satisfies NewSessionDeps;
  return { store, view, deps, actions: createNewSessionActions(deps) };
}

const viewsClosed = (deps: NewSessionDeps) => {
  const state = deps.store.getState();
  return !state.searchViewOpen && !state.inboxViewOpen && !state.notesViewOpen;
};

describe("createNewSessionActions", () => {
  it("opens a new chat in the sidebar's project with the focused session's permissions, leaving the views", () => {
    const { view, deps, actions } = setup();
    view.defaults = testSession("claude", "/work/other", undefined, "full-access");
    view.sidebarCwd = "/work/later";

    const id = actions.newSession();

    expect(deps.openSessionTab).toHaveBeenCalledWith(expect.objectContaining({ id, cwd: "/work/later", runtimeMode: "full-access" }), "/work/later");
    expect(deps.selectTab).toHaveBeenCalledWith(`tab-${id}`);
    expect(deps.setComposerFocused).toHaveBeenCalledWith(true);
    expect(deps.setAutomationsViewOpen).toHaveBeenCalledWith(false);
    expect(viewsClosed(deps)).toBe(true);
  });

  it("creates a tab in a worktree only when it differs from the project", () => {
    const { deps, actions } = setup();

    actions.createTab("/work/demo", { path: "/work/demo-wt", branch: "fix" });
    actions.createTab("/work/demo", { path: "/work/demo", branch: "main" });

    expect(deps.openSessionTab.mock.calls[0][0]).toMatchObject({ cwd: "/work/demo", worktreeCwd: "/work/demo-wt", branch: "fix" });
    expect(deps.openSessionTab.mock.calls[1][0]).not.toHaveProperty("worktreeCwd");
    expect(deps.selectTab).not.toHaveBeenCalled();
  });

  it("focuses the pane already showing a remote session", () => {
    const shell = { ...testSession("claude", remote), id: "shell" };
    const tab = { ...newTab("shell"), id: "t1" };
    rememberRemoteSession("shell", "r1");
    const { deps, actions } = setup([shell], [tab]);

    actions.selectRemoteSession(remote, "r1");

    expect(deps.activateTab).toHaveBeenCalledWith("t1", "shell");
    expect(deps.openSessionTab).not.toHaveBeenCalled();
    expect(viewsClosed(deps)).toBe(true);
  });

  it("reserves a new tab bound to an unopened remote session", () => {
    const { deps, actions } = setup();

    actions.selectRemoteSession(remote, "r2");

    const session = deps.openSessionTab.mock.calls[0][0];
    expect(deps.openSessionTab).toHaveBeenCalledWith(session, remote);
    expect(remoteSessionFor(session.id)).toBe("r2");
    expect(deps.selectTab).toHaveBeenCalledWith(`tab-${session.id}`);
  });

  it("splits the active tab's focused pane with a new chat in the focused session's folder", () => {
    const source = { ...testSession("claude", "/work/demo"), id: "src" };
    const tab = { ...newTab("src"), id: "t1" };
    const { store, view, deps, actions } = setup([source], [tab]);
    view.defaults = source;

    actions.split("right");

    const added = store.getState().sessions[1];
    expect(added.cwd).toBe("/work/demo");
    expect(leafIds(store.getState().tabs[0].layout)).toEqual(["src", added.id]);
    expect(deps.closeFamiliarView).toHaveBeenCalled();
    expect(deps.setComposerFocused).toHaveBeenCalledWith(true);
  });

  it("only leaves the Familiar view when there is no tab to split", () => {
    const { store, view, deps, actions } = setup();
    view.activeTab = undefined;

    actions.split("down");

    expect(deps.closeFamiliarView).toHaveBeenCalled();
    expect(store.getState().sessions).toHaveLength(0);
    expect(deps.setComposerFocused).not.toHaveBeenCalled();
  });

  it("sends ⌘T and ⌘W to the focused dock terminal, else to tabs and panes", () => {
    const { deps, actions } = setup();

    actions.newFocused();
    actions.closeFocused();
    expect(deps.openSessionTab).toHaveBeenCalledOnce();
    expect(deps.closePane).toHaveBeenCalledOnce();

    deps.terminals.focusedDockTerminal.mockReturnValue("term-1");
    actions.newFocused();
    actions.closeFocused();
    expect(deps.terminals.openNew).toHaveBeenCalledOnce();
    expect(deps.terminals.close).toHaveBeenCalledWith("term-1");
    expect(deps.openSessionTab).toHaveBeenCalledOnce();
  });
});
