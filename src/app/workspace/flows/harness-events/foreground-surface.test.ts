import { describe, expect, it } from "vitest";
import { foregroundSurface } from "./foreground-surface";

const closed = {
  searchViewOpen: false,
  inboxViewOpen: false,
  notesViewOpen: false,
  automationsViewOpen: false,
  settingsOpen: false,
  familiarViewId: null,
  inboxAskSessionId: "ask",
  shownFamiliarSessionId: "side",
};

describe("foregroundSurface", () => {
  it("shows the workspace when nothing covers it", () => {
    expect(foregroundSurface(closed)).toEqual({
      workspaceVisible: true,
      standaloneSessionId: undefined,
      sideSessionId: "side",
    });
  });

  it("shows the Familiar's chat and its side session over the workspace", () => {
    expect(foregroundSurface({ ...closed, familiarViewId: "fam" })).toEqual({
      workspaceVisible: false,
      standaloneSessionId: "fam",
      sideSessionId: "side",
    });
  });

  it("shows only the Inbox Ask chat while the Inbox is open", () => {
    expect(foregroundSurface({ ...closed, inboxViewOpen: true, familiarViewId: "fam" })).toEqual({
      workspaceVisible: false,
      standaloneSessionId: "ask",
    });
  });

  it("shows no conversation under Search, Notes, Automations or Settings", () => {
    for (const view of ["searchViewOpen", "notesViewOpen", "automationsViewOpen", "settingsOpen"]) {
      expect(foregroundSurface({ ...closed, familiarViewId: "fam", [view]: true })).toEqual({
        workspaceVisible: false,
      });
    }
  });
});
