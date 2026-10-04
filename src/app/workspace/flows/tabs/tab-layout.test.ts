import { describe, expect, it } from "vitest";
import type { Session } from "@/domain/session/session";
import {
  leafIds,
  newEditorPane,
  newFileTab,
  newTab,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import {
  appendTab,
  insertBeside,
  movePaneTo,
  openSessionTab,
  reorderPaneFiles,
  reorderTabs,
  splitFocusedPane,
  type TabLayoutDeps,
} from "./tab-layout";

function session(id: string): Session {
  return { ...testSession("claude", "/work/demo"), id };
}

function setup(tabs: WorkspaceTab[], projects: Record<string, string> = {}) {
  const store = createWorkspaceStore(
    testWorkspaceState({
      sessions: [],
      tabs,
      activeTabId: tabs[0]?.id ?? "",
    }),
  );
  const deps: TabLayoutDeps = {
    store,
    activeTabId: () => store.getState().activeTabId,
    projectOfTab: (tabId) => projects[tabId],
  };
  return { deps, store };
}

function ids(entries: { id: string }[]): string[] {
  return entries.map((entry) => entry.id);
}

describe("tab insertion", () => {
  it("opens a new tab right after the active one", () => {
    const tabs = [newTab("a"), newTab("b")];
    const { deps, store } = setup(tabs);
    const added = newTab("c");

    appendTab(deps, added, "/work/demo");

    expect(ids(store.getState().tabs)).toEqual([tabs[0].id, added.id, tabs[1].id]);
  });

  it("joins the anchor's group only for a tab of the same project", () => {
    const anchor = { ...newTab("a"), groupId: "g" };
    const { deps } = setup([anchor], { [anchor.id]: "demo" });

    const same = insertBeside(deps, [anchor], newTab("b"), anchor.id, "/work/demo");
    const other = insertBeside(deps, [anchor], newTab("c"), anchor.id, "/work/other");

    expect(same[1]?.groupId).toBe("g");
    expect(other[1]?.groupId).toBeUndefined();
  });

  it("adds a session in its own tab", () => {
    const { deps, store } = setup([newTab("a")]);

    const tab = openSessionTab(deps, session("b"), "/work/demo");

    expect(store.getState().sessions.map((entry) => entry.id)).toEqual(["b"]);
    const { tabs } = store.getState();
    expect(tabs[tabs.length - 1]).toBe(tab);
    expect(tab.focusedId).toBe("b");
  });
});

describe("pane layout", () => {
  it("splits the focused pane and focuses the new session", () => {
    const tabs = [newTab("a")];
    const { store } = setup(tabs);

    splitFocusedPane(store, tabs[0].id, "right", session("b"));

    const [tab] = store.getState().tabs;
    expect(leafIds(tab.layout)).toEqual(["a", "b"]);
    expect(tab.focusedId).toBe("b");
    expect(store.getState().sessions.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("moves a pane beside another and focuses it", () => {
    const tabs = [newTab("a")];
    const { store } = setup(tabs);
    splitFocusedPane(store, tabs[0].id, "right", session("b"));

    movePaneTo(store, "b", "a", "left");

    const [tab] = store.getState().tabs;
    expect(leafIds(tab.layout)).toEqual(["b", "a"]);
    expect(tab.focusedId).toBe("b");
  });

  it("reorders the files of one surface pane", () => {
    const first = newFileTab("a.ts", "/work/demo");
    const second = newFileTab("b.ts", "/work/demo");
    const pane = { ...newEditorPane(first), files: [first, second] };
    const { store } = setup([{ ...newTab("s"), editorPanes: [pane] }]);

    reorderPaneFiles(store, pane.id, [second.id, first.id]);

    expect(ids(store.getState().tabs[0].editorPanes[0].files)).toEqual([
      second.id,
      first.id,
    ]);
  });
});

describe("reorderTabs", () => {
  it("orders the visible tabs and keeps hidden ones in place", () => {
    const tabs = [newTab("a"), newTab("hidden"), newTab("b")];
    const { deps, store } = setup(tabs);

    reorderTabs(deps, [tabs[2].id, tabs[0].id]);

    expect(ids(store.getState().tabs)).toEqual([
      tabs[2].id,
      tabs[1].id,
      tabs[0].id,
    ]);
  });

  it("joins a group when a tab is dropped inside it", () => {
    const grouped = [
      { ...newTab("a"), groupId: "g" },
      { ...newTab("b"), groupId: "g" },
    ];
    const loose = newTab("c");
    const { deps, store } = setup([...grouped, loose]);

    reorderTabs(deps, [grouped[0].id, loose.id, grouped[1].id], loose.id);

    expect(store.getState().tabs[1]).toMatchObject({ id: loose.id, groupId: "g" });
  });
});
