// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { leaf, leafIds, splitPane } from "@/features/workspace/model/layout";
import { closePane, closeTitleTab } from "./pane-close";
import {
  session,
  sessionTab,
  settle,
  setupTabClose,
} from "./tab-close.fixture";

function splitTab() {
  return { ...sessionTab("t1", "a"), layout: splitPane(leaf("a"), "a", "right", "b"), focusedId: "b" };
}

describe("closePane", () => {
  it("closes the focused conversation pane and focuses the other", () => {
    const { deps, store } = setupTabClose([session("a"), session("b")], [splitTab()]);

    closePane(deps);

    const tab = store.getState().tabs[0];
    expect((tab ? leafIds(tab.layout) : [])).toEqual(["a"]);
    expect(tab?.focusedId).toBe("a");
    expect(deps.persist).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    expect(deps.setComposerFocused).toHaveBeenCalledWith(true);
  });

  it("closes a Familiar in view instead", () => {
    const { deps, store } = setupTabClose([session("a"), session("b")], [splitTab()]);
    store.getState().setFamiliarViewId("familiar");

    closePane(deps);

    expect(deps.closeFamiliarView).toHaveBeenCalled();
    expect(leafIds(store.getState().tabs[0]?.layout ?? { type: "leaf", id: "" })).toEqual(["a", "b"]);
  });

  it("clears the project's last tab when its last pane closes", () => {
    const { deps, store } = setupTabClose([session("a")], [sessionTab("t1", "a")]);

    closePane(deps);

    expect(store.getState().sessions).toHaveLength(2);
    expect(store.getState().tabs[0]?.focusedId).toBe(store.getState().sessions[1]?.id);
  });
});

describe("closeTitleTab", () => {
  it("closes a background tab", async () => {
    const { deps, tabIds } = setupTabClose(
      [session("a"), session("b")],
      [sessionTab("t1", "a"), sessionTab("t2", "b")],
    );

    closeTitleTab(deps, "t2");
    await settle();

    expect(deps.closeFamiliarView).toHaveBeenCalled();
    expect(tabIds()).toEqual(["t1"]);
  });

  it("closes the active kept tab's pane instead of the tab", () => {
    const { deps, store, tabIds } = setupTabClose([session("a")], [sessionTab("t1", "a")]);

    closeTitleTab(deps, "t1");

    expect(tabIds()).toEqual(["t1"]);
    expect(store.getState().sessions).toHaveLength(2);
  });
});
