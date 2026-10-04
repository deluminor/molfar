import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { refreshProjectHistory } from "./refresh-history";

function summary(id: string, cwd = "/work/demo"): SessionSummary {
  return {
    id,
    cwd,
    harness: "claude",
    model: "claude:sonnet-5",
    runtimeMode: "supervised",
    title: id,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("refreshProjectHistory", () => {
  it("lists the project's rows and marks it loaded", async () => {
    const store = createWorkspaceStore(testWorkspaceState());

    await refreshProjectHistory(store, "/work/demo/", {
      list: async () => [summary("a")],
      sidebarCwd: () => "/work/demo/",
    });

    expect(store.getState().history.map((row) => row.id)).toEqual(["a"]);
    expect([...store.getState().loadedProjects]).toEqual(["/work/demo"]);
    expect(store.getState().historyErrorCwd).toBeNull();
  });

  it("drops a late answer for a project the sidebar left", async () => {
    const store = createWorkspaceStore(testWorkspaceState());

    await refreshProjectHistory(store, "/work/demo", {
      list: async () => [summary("a")],
      sidebarCwd: () => "/work/other",
    });

    expect(store.getState().history).toEqual([]);
    expect(store.getState().loadedProjects.size).toBe(0);
  });

  it("reports a failed first load for the project", async () => {
    const store = createWorkspaceStore(testWorkspaceState());

    await refreshProjectHistory(store, "/work/demo", {
      list: async () => {
        throw new Error("store locked");
      },
      sidebarCwd: () => "/work/demo",
    });

    expect(store.getState().historyErrorCwd).toBe("/work/demo");
  });

  it("keeps cached rows without an error when a revalidate fails", async () => {
    const cached = summary("cached");
    const store = createWorkspaceStore(
      testWorkspaceState({
        history: [cached],
        loadedProjects: new Set(["/work/demo"]),
      }),
    );

    await refreshProjectHistory(store, "/work/demo", {
      list: async () => {
        throw new Error("store locked");
      },
      sidebarCwd: () => "/work/demo",
    });

    expect(store.getState().history).toEqual([cached]);
    expect(store.getState().historyErrorCwd).toBeNull();
  });

  it("does nothing for home", async () => {
    const store = createWorkspaceStore(testWorkspaceState());
    const list = vi.fn(async () => [summary("a")]);

    await refreshProjectHistory(store, "~", { list, sidebarCwd: () => "~" });

    expect(list).not.toHaveBeenCalled();
  });
});
