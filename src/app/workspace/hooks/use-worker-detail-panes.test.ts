// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { leafIds, newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../store/create-workspace-store";
import type { WorkerDetailRequest } from "../store/surfaces-slice";
import { testWorkspaceState } from "../store/test-state";
import { useWorkerDetailPanes } from "./use-worker-detail-panes";

const request: WorkerDetailRequest = {
  leadId: "lead",
  workers: [
    { sessionId: "w1", leadId: "lead", title: "One", harness: "claude" },
    { sessionId: "w2", leadId: "lead", title: "Two", harness: "claude" },
  ],
};

function render(tabs: WorkspaceTab[], sessions: Session[]) {
  const store = createWorkspaceStore(testWorkspaceState({ tabs, workerDetailRequest: request }));
  const deps = {
    store,
    sessionsRef: { current: sessions },
    projectCwd: () => "/work/project",
    selectTab: vi.fn(),
    setComposerFocused: vi.fn(),
  };
  function Probe() {
    useWorkerDetailPanes(tabs, request, deps);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  act(() => root.unmount());
  return { store, deps };
}

describe("useWorkerDetailPanes", () => {
  beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));

  it("opens the workers beside the lead, first one focused", () => {
    const lead = { ...testSession("claude", "/work/lead"), id: "lead" };
    const { store, deps } = render([{ ...newTab("lead"), id: "t1" }], [lead]);

    const tab = store.getState().tabs[0];
    expect(store.getState().workerDetailRequest).toBeNull();
    expect(leafIds(tab.layout).length).toBe(2);
    expect(deps.selectTab).toHaveBeenCalledWith("t1");
    expect(deps.setComposerFocused).toHaveBeenCalledWith(false);
    expect(JSON.stringify(tab)).toContain('"cwd":"/work/lead"');
  });

  it("waits for the lead's tab while the lead is still opening", () => {
    const lead = { ...testSession("claude", "/work/lead"), id: "lead" };
    const { store, deps } = render([], [lead]);

    expect(store.getState().workerDetailRequest).toEqual(request);
    expect(deps.selectTab).not.toHaveBeenCalled();
  });

  it("drops the request when the lead never arrived", () => {
    const { store, deps } = render([], []);

    expect(store.getState().workerDetailRequest).toBeNull();
    expect(deps.selectTab).not.toHaveBeenCalled();
  });
});
