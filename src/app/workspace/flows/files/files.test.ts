import { describe, expect, it, vi } from "vitest";
import {
  newEditorWorkspaceTab,
  newFileTab,
  newTab,
  openEditorTab,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { dropOpenFiles } from "./drop-open-files";
import { fileDeleted, fileMoved } from "./file-paths";
import { setFileDirty, setFileErrorCount } from "./file-state";

vi.mock("@/features/files/model/file-index", () => ({ invalidateProjectFiles: vi.fn() }));

const file = (path: string) => newFileTab(path, "/work/demo", false, undefined, "/work/demo");

function tabWith(paths: string[]): WorkspaceTab {
  return paths.reduce(
    (tab, path) => openEditorTab(tab, file(path), { split: "right", pin: true }),
    { ...newTab("s"), id: "t" },
  );
}

function setup(tabs: WorkspaceTab[]) {
  const store = createWorkspaceStore(testWorkspaceState({ sessions: [testSession()], tabs }));
  return { store, tabsRef: { current: tabs } };
}

const paths = (tab: WorkspaceTab) =>
  tab.editorPanes.flatMap((pane) => pane.files.map((entry) => ("path" in entry ? entry.path : "")));

describe("files on disk", () => {
  it("rebases open files under a moved folder", () => {
    const deps = setup([tabWith(["/work/demo/src/a.ts", "/work/demo/b.ts"])]);

    fileMoved(deps, "/work/demo/src", "/work/demo/lib");

    expect(paths(deps.store.getState().tabs[0])).toEqual(["/work/demo/lib/a.ts", "/work/demo/b.ts"]);
  });

  it("closes deleted files and forgets that they were unsaved", () => {
    const tab = tabWith(["/work/demo/src/a.ts"]);
    const deps = setup([tab]);
    const id = tab.editorPanes[0].files[0].id;
    setFileDirty(deps, id, true);

    fileDeleted(deps, "/work/demo/src");

    expect(paths(deps.store.getState().tabs[0])).toEqual([]);
    expect(deps.store.getState().dirtyFiles.has(id)).toBe(false);
  });

  it("drops an emptied pane and refocuses its sibling", () => {
    const tab = tabWith(["/work/demo/a.ts"]);
    const next = dropOpenFiles({ ...tab, focusedId: tab.editorPanes[0].id }, () => true);

    expect(next.editorPanes).toEqual([]);
    expect(next.focusedId).toBe("s");
  });

  it("keeps a workspace tab without filesystem files untouched", () => {
    const workspace = newEditorWorkspaceTab(file("/work/demo/a.ts"));

    expect(dropOpenFiles(workspace, () => false).editorPanes).toHaveLength(1);
  });
});

describe("file state", () => {
  it("pins an edited preview and tracks it as unsaved", () => {
    const deps = setup([tabWith(["/work/demo/a.ts"])]);

    setFileDirty(deps, "f", true);
    expect(deps.store.getState().dirtyFiles.has("f")).toBe(true);

    setFileDirty(deps, "f", false);
    expect(deps.store.getState().dirtyFiles.has("f")).toBe(false);
  });

  it("counts a file's errors until the editor reports none", () => {
    const deps = setup([]);

    setFileErrorCount(deps, "f", 3);
    expect(deps.store.getState().fileErrorCounts.get("f")).toBe(3);

    setFileErrorCount(deps, "f", 0);
    expect(deps.store.getState().fileErrorCounts.has("f")).toBe(false);
  });
});
