import { describe, expect, it, vi } from "vitest";
import type { RecentProject } from "@/features/projects/model/recents";
import { createWorkspaceStore } from "./create-workspace-store";
import { testWorkspaceState } from "./test-state";

const demo: RecentProject = { path: "/work/demo", openedAt: 1 };

describe("createWorkspaceStore", () => {
  it("starts from the initial state", () => {
    const store = createWorkspaceStore(testWorkspaceState({ recents: [demo] }));

    expect(store.getState()).toMatchObject({
      projectCwd: "~",
      recents: [demo],
    });
  });

  it("sets a field from a value or from an updater of the previous value", () => {
    const store = createWorkspaceStore(testWorkspaceState());

    store.getState().setProjectCwd("/work/demo");
    store.getState().setRecents((previous) => [...previous, demo]);

    expect(store.getState().projectCwd).toBe("/work/demo");
    expect(store.getState().recents).toEqual([demo]);
  });

  it("notifies subscribers once per change and not at all for the same value", () => {
    const store = createWorkspaceStore(testWorkspaceState());
    const listener = vi.fn();
    store.subscribe(listener);

    store.getState().setProjectCwd("/work/demo");
    store.getState().setProjectCwd("/work/demo");
    store.getState().setRecents((previous) => previous);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
