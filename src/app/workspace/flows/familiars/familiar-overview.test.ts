import { describe, expect, it } from "vitest";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import {
  forgetOverviewDocument,
  leaveOverviewItems,
  openOverviewDocument,
  showFamiliarActivity,
} from "./familiar-overview";

function setup() {
  return createWorkspaceStore(testWorkspaceState());
}

describe("familiar overview", () => {
  it("opens a document on the Documents tab in place of a shown session", () => {
    const store = setup();
    store.setState({ familiarOverviewOpen: false, familiarShownSession: "launched" });

    openOverviewDocument(store, "doc");

    expect(store.getState()).toMatchObject({
      familiarShownSession: null,
      familiarOverviewDocument: "doc",
      familiarOverviewTab: "documents",
      familiarOverviewOpen: true,
    });
  });

  it("forgets only the deleted document", () => {
    const store = setup();
    store.setState({ familiarOverviewDocument: "doc" });

    forgetOverviewDocument(store, "other");
    expect(store.getState().familiarOverviewDocument).toBe("doc");

    forgetOverviewDocument(store, "doc");
    expect(store.getState().familiarOverviewDocument).toBeNull();
  });

  it("leaves what was open over the list", () => {
    const store = setup();
    store.setState({ familiarShownSession: "launched", familiarOverviewDocument: "doc" });

    leaveOverviewItems(store);

    expect(store.getState().familiarShownSession).toBeNull();
    expect(store.getState().familiarOverviewDocument).toBeNull();
  });

  it("shows a turn's activity, and clears it when the shown turn is picked again", () => {
    const store = setup();

    showFamiliarActivity(store, "chat", "turn", []);
    expect(store.getState().familiarActivity).toEqual({
      sessionId: "chat",
      turnId: "turn",
      blocks: [],
    });
    expect(store.getState().familiarOverviewTab).toBe("activity");

    showFamiliarActivity(store, "chat", "turn", []);
    expect(store.getState().familiarActivity).toBeNull();
  });

  it("shows a turn again when the Activity tab was not the one showing it", () => {
    const store = setup();
    showFamiliarActivity(store, "chat", "turn", []);
    store.setState({ familiarOverviewTab: "sessions" });

    showFamiliarActivity(store, "chat", "turn", []);

    expect(store.getState().familiarActivity).not.toBeNull();
  });
});
