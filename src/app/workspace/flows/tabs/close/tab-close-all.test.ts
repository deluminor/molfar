// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { closeAllTabs, closeEveryTab } from "./tab-close-all";
import {
  file,
  session,
  sessionTab,
  settle,
  setupTabClose,
  tabWithFiles,
} from "./tab-close.fixture";

describe("closeAllTabs", () => {
  it("closes the active tab's open files first", async () => {
    const { deps, store, tabIds } = setupTabClose(
      [session("a"), session("b")],
      [tabWithFiles("t1", "a", [file("f1")]), sessionTab("t2", "b")],
    );

    closeAllTabs(deps);
    await settle();

    expect(deps.closeFamiliarView).toHaveBeenCalled();
    expect(tabIds()).toEqual(["t1", "t2"]);
    expect(store.getState().tabs[0]?.editorPanes).toEqual([]);
    expect(store.getState().sessions.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("closes the other tabs and starts the active one over when no files are open", async () => {
    const { deps, store, tabIds } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), sessionTab("t2", "b")],
    );

    closeAllTabs(deps);
    await settle();

    expect(tabIds()).toEqual(["t1"]);
    expect(store.getState().tabs[0]?.focusedId).not.toBe("a");
  });
});

describe("closeEveryTab", () => {
  it("leaves every tab when a prompt is declined", async () => {
    const { deps, tabIds } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), tabWithFiles("t2", "b", [file("f1")])],
      { dirty: ["f1"], confirm: false },
    );

    closeEveryTab(deps);
    await settle();

    expect(tabIds()).toEqual(["t1", "t2"]);
  });

  it("keeps tabs outside the scope", async () => {
    const { deps, tabIds } = setupTabClose(
      [session("a"), session("b"), session("c")],
      [sessionTab("t1", "a"), sessionTab("t2", "b"), sessionTab("t3", "c")],
    );

    closeEveryTab(deps, ["t1", "t2"]);
    await settle();

    expect(tabIds()).toEqual(["t1", "t3"]);
  });
});
