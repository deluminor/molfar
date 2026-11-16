import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { newTab, splitPane, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { PaneDeps } from "./pane-deps";
import { focusPane } from "./pane-focus";
import { selectHistorySession } from "./select-history-session";

const session = (id: string, cwd = "/work/demo"): Session => ({ ...testSession("claude", cwd), id });

function setup(tabs: WorkspaceTab[], sessions: Session[], saved: Session[] = []) {
  const store = createWorkspaceStore(testWorkspaceState({ sessions, tabs, activeTabId: tabs[0]?.id ?? "" }));
  const tabsRef = { current: tabs };
  store.subscribe((state) => {
    tabsRef.current = state.tabs;
  });
  const deps = {
    store,
    tabsRef,
    activeTabIdRef: { current: tabs[0]?.id ?? "" },
    sessionsRef: { current: sessions },
    setComposerFocused: vi.fn(),
    closeFamiliarView: vi.fn(),
    closeAutomations: vi.fn(),
    cancelNavigation: vi.fn(),
    activateTab: vi.fn(),
    selectTab: vi.fn(),
    appendTab: vi.fn(),
    ensureOpenSession: vi.fn(async (id: string) => [...sessions, ...saved].find((entry) => entry.id === id)),
    openFamiliar: vi.fn(async () => undefined),
    focusOpenSession: vi.fn(() => false),
    replaceBlankPane: vi.fn(() => false),
    linkedUpdates: () => new Map(),
    revealLinkedUpdate: vi.fn(),
  } satisfies PaneDeps;
  return { deps, store };
}

const split = (): WorkspaceTab => ({ ...newTab("a"), id: "t", layout: splitPane({ type: "leaf", id: "a" }, "a", "right", "b") });

describe("focusPane", () => {
  it("focuses another pane of the active tab and its composer", () => {
    const { deps, store } = setup([split()], [session("a"), session("b")]);

    focusPane(deps, "b");

    expect(store.getState().tabs[0].focusedId).toBe("b");
    expect(deps.cancelNavigation).toHaveBeenCalled();
    expect(deps.setComposerFocused).toHaveBeenLastCalledWith(true);
  });

  it("ignores a pane outside the workspace while a Familiar is open", () => {
    const { deps, store } = setup([split()], [session("a"), session("b")]);
    store.getState().setFamiliarViewId("familiar");

    focusPane(deps, "elsewhere");

    expect(deps.closeFamiliarView).not.toHaveBeenCalled();
  });
});

describe("selectHistorySession", () => {
  it("opens a saved session in a new tab and leaves the overlay views", async () => {
    const { deps, store } = setup([split()], [session("a")], [session("s", "/work/other")]);
    store.getState().setInboxViewOpen(true);

    await selectHistorySession(deps, "s");

    expect(deps.appendTab).toHaveBeenCalledWith(expect.objectContaining({ focusedId: "s" }), "/work/other");
    expect(store.getState().inboxViewOpen).toBe(false);
    expect(store.getState().projectCwd).toBe("/work/other");
  });

  it("focuses the tab already showing the session", async () => {
    const { deps } = setup([split()], [session("a")]);
    deps.focusOpenSession.mockReturnValue(true);

    await selectHistorySession(deps, "a");

    expect(deps.appendTab).not.toHaveBeenCalled();
  });
});
