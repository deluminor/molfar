// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { leafIds } from "@/features/workspace/model/layout";
import { closeFile, closeOtherFiles } from "./file-close";
import {
  file,
  session,
  sessionTab,
  settle,
  setupTabClose,
  tabWithFiles,
} from "./tab-close.fixture";

describe("closeFile", () => {
  it("shows the next file when the active one closes", async () => {
    const { deps, store } = setupTabClose(
      [session("a")],
      [tabWithFiles("t1", "a", [file("f1"), file("f2")], "p1")],
    );

    closeFile(deps, "p1", "f1");
    await settle();

    const pane = store.getState().tabs[0]?.editorPanes[0];
    expect(pane?.files.map((entry) => entry.id)).toEqual(["f2"]);
    expect(pane?.activeFileId).toBe("f2");
    expect(store.getState().tabs[0]?.focusedId).toBe("p1");
  });

  it("removes the pane with its last file and focuses the conversation", async () => {
    const { deps, store } = setupTabClose([session("a")], [tabWithFiles("t1", "a", [file("f1")], "p1")]);
    store.getState().setTabs((tabs) => tabs.map((tab) => ({ ...tab, focusedId: "p1" })));

    closeFile(deps, "p1", "f1");
    await settle();

    const tab = store.getState().tabs[0];
    expect(tab?.editorPanes).toEqual([]);
    expect((tab ? leafIds(tab.layout) : [])).toEqual(["a"]);
    expect(tab?.focusedId).toBe("a");
    expect(deps.setComposerFocused).toHaveBeenCalledWith(true);
  });

  it("asks before closing an unsaved file and keeps it when declined", async () => {
    const { deps, store, confirm } = setupTabClose(
      [session("a")],
      [tabWithFiles("t1", "a", [file("f1")], "p1")],
      { dirty: ["f1"], confirm: false },
    );

    closeFile(deps, "p1", "f1");
    await settle();

    expect(confirm).toHaveBeenCalledWith("Close f1.ts without saving?");
    expect(store.getState().tabs[0]?.editorPanes[0]?.files).toHaveLength(1);
  });

  it("starts the project's last tab over when its only pane closes", async () => {
    const tab = { ...sessionTab("t1", "p1"), editorPanes: [{ id: "p1", files: [file("f1")], activeFileId: "f1" }] };
    const { deps, store } = setupTabClose([], [tab]);

    closeFile(deps, "p1", "f1");
    await settle();

    const next = store.getState().tabs[0];
    expect(store.getState().sessions).toHaveLength(1);
    expect(next?.focusedId).toBe(store.getState().sessions[0]?.id);
    expect(next?.editorPanes).toEqual([]);
  });
});

describe("closeOtherFiles", () => {
  it("keeps only the chosen file in the pane", async () => {
    const { deps, store } = setupTabClose(
      [session("a")],
      [tabWithFiles("t1", "a", [file("f1"), file("f2"), file("f3")], "p1")],
      { dirty: ["f1"] },
    );

    closeOtherFiles(deps, "p1", "f2");
    await settle();

    const pane = store.getState().tabs[0]?.editorPanes[0];
    expect(pane?.files.map((entry) => entry.id)).toEqual(["f2"]);
    expect(pane?.activeFileId).toBe("f2");
    expect(store.getState().dirtyFiles.has("f1")).toBe(false);
  });
});
