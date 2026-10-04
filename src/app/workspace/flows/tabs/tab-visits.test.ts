import { describe, expect, it } from "vitest";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { createTabVisits } from "./tab-visits";

function setup() {
  const store = createWorkspaceStore(testWorkspaceState());
  const visits = createTabVisits(store, "a");
  const open = new Set(["a", "b", "c"]);
  return { store, visits, open };
}

describe("createTabVisits", () => {
  it("records visits and publishes whether Back and Forward can move", () => {
    const { store, visits, open } = setup();

    visits.sync(open, "b");

    expect(store.getState().tabVisitNav).toEqual({
      canBack: true,
      canForward: false,
    });
  });

  it("steps back and forward without recording the step as a visit", () => {
    const { store, visits, open } = setup();
    visits.sync(open, "b");

    expect(visits.step("back", open, "b")).toBe("a");
    visits.sync(open, "a");
    expect(store.getState().tabVisitNav).toEqual({
      canBack: false,
      canForward: true,
    });

    expect(visits.step("forward", open, "a")).toBe("b");
  });

  it("does not step to a tab that closed", () => {
    const { visits, open } = setup();
    visits.sync(open, "b");

    expect(visits.step("back", new Set(["b"]), "b")).toBeNull();
  });

  it("has nowhere to go before any visit", () => {
    const { visits, open } = setup();

    expect(visits.step("back", open, "a")).toBeNull();
    expect(visits.step("forward", open, "a")).toBeNull();
  });
});
