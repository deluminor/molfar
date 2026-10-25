import { describe, expect, it } from "vitest";
import type { WorkspaceTab } from "./layout";
import { openFilePaths } from "./open-file-paths";

const tab = (...panes: Array<Array<Record<string, unknown>>>) =>
  ({ editorPanes: panes.map((files) => ({ files })) }) as unknown as WorkspaceTab;

describe("openFilePaths", () => {
  it("lists each open file once across panes and tabs, skipping terminals, virtual documents and change views", () => {
    const tabs = [
      tab([{ path: "/a.ts" }, { path: "/b.ts", sessionChanges: true }], [{ path: "/a.ts" }]),
      tab([{ path: "/c.ts" }]),
    ];

    expect(openFilePaths(tabs)).toEqual(["/a.ts", "/c.ts"]);
  });
});
