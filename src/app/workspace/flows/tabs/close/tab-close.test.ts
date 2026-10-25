// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { closeOtherTabs, closeTab, closeTabs } from "./tab-close";
import {
  file,
  session,
  sessionTab,
  settle,
  setupTabClose,
  tabWithFiles,
} from "./tab-close.fixture";

describe("closeTab", () => {
  it("closes a background tab and saves its conversation", async () => {
    const { deps, tabIds, store } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), sessionTab("t2", "b")],
    );

    closeTab(deps, "t2");
    await settle();

    expect(tabIds()).toEqual(["t1"]);
    expect(store.getState().activeTabId).toBe("t1");
    expect(deps.persist).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    expect(deps.refreshHistory).toHaveBeenCalled();
  });

  it("moves to the next tab when the active one closes", async () => {
    const { deps, tabIds } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), sessionTab("t2", "b")],
      { activeTabId: "t2" },
    );

    closeTab(deps, "t2");
    await settle();

    expect(tabIds()).toEqual(["t1"]);
    expect(deps.activateTab).toHaveBeenCalledWith("t1");
  });

  it("keeps the project's last tab", async () => {
    const { deps, tabIds } = setupTabClose([session("a")], [sessionTab("t1", "a")]);

    closeTab(deps, "t1");
    await settle();

    expect(tabIds()).toEqual(["t1"]);
  });

  it("keeps a tab with unsaved files when the prompt is declined", async () => {
    const { deps, tabIds, confirm } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), tabWithFiles("t2", "b", [file("f1")])],
      { dirty: ["f1"], confirm: false },
    );

    closeTab(deps, "t2");
    await settle();

    expect(confirm).toHaveBeenCalledWith("Close this tab with unsaved files?");
    expect(tabIds()).toEqual(["t1", "t2"]);
  });

  it("forgets the closed tab's unsaved files once confirmed", async () => {
    const { deps, store } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), tabWithFiles("t2", "b", [file("f1")])],
      { dirty: ["f1"] },
    );

    closeTab(deps, "t2");
    await settle();

    expect(store.getState().dirtyFiles.has("f1")).toBe(false);
  });
});

describe("closeTabs", () => {
  it("closes the tabs and activates the fallback when the active one went", async () => {
    const { deps, tabIds } = setupTabClose(
      [session("a"), session("b"), session("c")],
      [sessionTab("t1", "a"), sessionTab("t2", "b"), sessionTab("t3", "c")],
      { activeTabId: "t2" },
    );

    closeTabs(deps, ["t2", "t3"], "t1");
    await settle();

    expect(tabIds()).toEqual(["t1"]);
    expect(deps.activateTab).toHaveBeenCalledWith("t1");
  });

  it("does nothing without a fallback outside the closing tabs", async () => {
    const { deps, tabIds } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), sessionTab("t2", "b")],
    );

    closeTabs(deps, ["t1", "t2"], "t1");
    await settle();

    expect(tabIds()).toEqual(["t1", "t2"]);
  });

  it("skips the prompts when the caller confirmed", () => {
    const { deps, tabIds, confirm } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), tabWithFiles("t2", "b", [file("f1")])],
      { dirty: ["f1"] },
    );

    closeTabs(deps, ["t2"], "t1", { confirmed: true });

    expect(confirm).not.toHaveBeenCalled();
    expect(tabIds()).toEqual(["t1"]);
  });
});

describe("closeOtherTabs", () => {
  it("keeps only the active tab", async () => {
    const { deps, tabIds } = setupTabClose(
      [session("a"), session("b"), session("c")],
      [sessionTab("t1", "a"), sessionTab("t2", "b"), sessionTab("t3", "c")],
      { activeTabId: "t2" },
    );

    closeOtherTabs(deps);
    await settle();

    expect(tabIds()).toEqual(["t2"]);
  });
});
