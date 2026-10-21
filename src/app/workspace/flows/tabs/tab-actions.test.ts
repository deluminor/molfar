import { describe, expect, it, vi } from "vitest";
import { newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { openDiff } from "../files/open-diff";
import type { PaneDeps } from "./pane-deps";
import { createTabActions } from "./tab-actions";
import type { TabActionsDeps } from "./tab-actions-deps";

vi.mock("../files/open-diff", () => ({ openDiff: vi.fn(async () => undefined) }));

const tab = (id: string, sessionId: string): WorkspaceTab => ({ ...newTab(sessionId), id });

function setup(tabs: WorkspaceTab[] = [tab("t1", "a"), tab("t2", "b"), tab("t3", "c")]) {
  const store = createWorkspaceStore(testWorkspaceState({ tabs, activeTabId: "t1" }));
  const activeTabIdRef = { current: "t1" };
  const pane = {
    store,
    tabsRef: { current: tabs },
    activeTabIdRef,
    setComposerFocused: vi.fn(),
    activateTab: vi.fn(),
  } as unknown as PaneDeps;
  const deck = { current: tabs };
  const deps = {
    pane,
    diff: { gitCwd: () => "/work/demo", sidebarCwd: () => "/work/demo", setSidebarTab: vi.fn() },
    layout: {},
    visits: { step: vi.fn(() => "t3") },
    deckTabs: () => deck.current,
  } as unknown as TabActionsDeps;
  return { deps, store, deck, activeTabIdRef, actions: createTabActions(deps) };
}

describe("createTabActions", () => {
  it("steps through the deck from the active tab read at call time", () => {
    const { deps, activeTabIdRef, actions } = setup();

    actions.next();
    expect(deps.pane.activateTab).toHaveBeenLastCalledWith("t2");

    activeTabIdRef.current = "t3";
    actions.prev();
    expect(deps.pane.activateTab).toHaveBeenLastCalledWith("t2");

    actions.activateSlot(0);
    expect(deps.pane.activateTab).toHaveBeenLastCalledWith("t1");
    actions.activateSlot(-1);
    expect(deps.pane.activateTab).toHaveBeenLastCalledWith("t3");
  });

  it("reads the latest rendered deck", () => {
    const { deps, deck, actions } = setup();
    deck.current = [tab("t1", "a"), tab("t9", "z")];

    actions.next();

    expect(deps.pane.activateTab).toHaveBeenLastCalledWith("t9");
  });

  it("returns to the tabs instead of stepping while a Familiar covers them", () => {
    const { deps, store, actions } = setup();
    store.getState().setFamiliarViewId("f1");

    actions.next();
    actions.visitBack();

    expect(deps.pane.activateTab).toHaveBeenCalledTimes(2);
    expect(deps.pane.activateTab).toHaveBeenLastCalledWith("t1");
    expect(deps.visits.step).not.toHaveBeenCalled();
  });

  it("visits back through open tabs", () => {
    const { deps, actions } = setup();

    actions.visitBack();

    expect(deps.visits.step).toHaveBeenCalledWith("back", new Set(["t1", "t2", "t3"]), "t1");
    expect(deps.pane.activateTab).toHaveBeenCalledWith("t3");
  });

  it("opens a working-tree diff exactly and Familiar session changes on the overview", () => {
    const { deps, store, actions } = setup();

    actions.openWorkingTreeDiff("src/a.ts", "staged", true);
    expect(openDiff).toHaveBeenCalledWith(deps.diff, "src/a.ts", {
      session: undefined,
      changeKind: "staged",
      pin: true,
      exact: true,
    });

    actions.openMonoDiff("src/b.ts", { sessionId: "s", cwd: "/work/demo" });
    expect(store.getState()).toMatchObject({
      familiarOverviewOpen: true,
      familiarOverviewTab: "changes",
      familiarChangesRequest: { path: "src/b.ts" },
      familiarShownSession: null,
    });
  });

  it("opens all changes and a commit in the active tab, leaving the composer", () => {
    const { deps, store, actions } = setup();

    actions.openAllChanges("unstaged");
    actions.openCommit({ sha: "abc123", shortSha: "abc", subject: "fix" } as never);

    const [active, other] = store.getState().tabs;
    expect(active.editorPanes.flatMap((pane) => pane.files)).toHaveLength(2);
    expect(other).toEqual(tab("t2", "b"));
    expect(deps.pane.setComposerFocused).toHaveBeenCalledWith(false);
  });

  it("shows source control in the Changes sidebar tab", () => {
    const { deps, actions } = setup();

    actions.showSourceControl();

    expect(deps.diff.setSidebarTab).toHaveBeenCalledWith("changes");
  });
});
