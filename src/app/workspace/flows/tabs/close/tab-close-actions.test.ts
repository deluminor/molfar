// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createTabCloseActions } from "./tab-close-actions";
import { file, session, sessionTab, settle, setupTabClose, tabWithFiles } from "./tab-close.fixture";

describe("createTabCloseActions", () => {
  it("closes a tab and activates the one left", async () => {
    const { deps, store, tabIds } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), sessionTab("t2", "b")],
    );

    createTabCloseActions(deps).closeTab("t1");
    await settle();

    expect(tabIds()).toEqual(["t2"]);
    expect(store.getState().activeTabId).toBe("t2");
  });

  it("closes the other files of a pane", async () => {
    const { deps, store } = setupTabClose(
      [session("a")],
      [tabWithFiles("t1", "a", [file("f1"), file("f2")], "p1")],
    );

    createTabCloseActions(deps).closeOtherFiles("p1", "f2");
    await settle();

    expect(store.getState().tabs[0]?.editorPanes[0]?.files.map((entry) => entry.id)).toEqual(["f2"]);
  });

  it("closes the other tabs, keeping the active one", async () => {
    const { deps, tabIds } = setupTabClose(
      [session("a"), session("b"), session("c")],
      [sessionTab("t1", "a"), sessionTab("t2", "b"), sessionTab("t3", "c")],
      { activeTabId: "t2" },
    );

    createTabCloseActions(deps).closeOtherTabs();
    await settle();

    expect(tabIds()).toEqual(["t2"]);
  });
});
