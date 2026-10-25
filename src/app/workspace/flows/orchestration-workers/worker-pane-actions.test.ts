import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { prepareOrchestrationWorkerDetails } from "@/features/orchestration/model/orchestration-workspace";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { closeLiveAgent, type CloseLiveAgentDeps } from "../turn-control/close-live-agent";
import { createWorkerPaneActions } from "./worker-pane-actions";

vi.mock("@/features/orchestration/model/orchestration", () => ({
  orchestrator: { forSession: vi.fn(() => undefined) },
}));
vi.mock("@/features/orchestration/model/orchestration-workspace", () => ({
  prepareOrchestrationWorkerDetails: vi.fn(),
}));
vi.mock("../turn-control/close-live-agent", () => ({ closeLiveAgent: vi.fn(async () => undefined) }));

const worker = { sessionId: "w", leadId: "lead", title: "Worker", harness: "claude" as const };

function setup(sessions: Session[] = [], open: string[] = []) {
  const store = createWorkspaceStore(testWorkspaceState({ searchViewOpen: true, notesViewOpen: true }));
  const deps = {
    store,
    sessionsRef: { current: sessions },
    setAutomationsViewOpen: vi.fn(),
    focusOpenSession: vi.fn((id: string) => open.includes(id)),
    selectHistorySession: vi.fn(async () => undefined),
    ensureOpenSession: vi.fn(async () => undefined),
    closeLive: {} as CloseLiveAgentDeps,
  };
  return { deps, store, panes: createWorkerPaneActions(deps) };
}

describe("createWorkerPaneActions", () => {
  it("opens a worker inside its lead's tab and inspects it", () => {
    const { deps, store, panes } = setup([{ ...testSession("claude", "/work"), id: "w", orchestrationLeadId: "lead" }]);

    panes.openSession("w");

    expect(store.getState().inspectedWorkerId).toBe("w");
    expect(deps.focusOpenSession).toHaveBeenCalledWith("lead");
    expect(deps.selectHistorySession).toHaveBeenCalledWith("lead");
  });

  it("finds a worker's lead through the orchestrator when the session is not open", () => {
    vi.mocked(orchestrator.forSession).mockReturnValueOnce({ leadId: "lead" } as never);
    const { deps, panes } = setup([], ["lead"]);

    panes.openSession("w");

    expect(deps.focusOpenSession).toHaveBeenCalledWith("lead");
    expect(deps.selectHistorySession).not.toHaveBeenCalled();
  });

  it("focuses any other session, loading it from history when no tab holds it", () => {
    const { deps, store, panes } = setup([], ["open"]);

    panes.openSession("open");
    panes.openSession("saved");

    expect(store.getState().inspectedWorkerId).toBeNull();
    expect(deps.selectHistorySession.mock.calls).toEqual([["saved"]]);
  });

  it("leaves the app views for a working-rail agent", () => {
    const { deps, store, panes } = setup([], ["s"]);

    panes.selectLiveAgent("s");

    expect(store.getState()).toMatchObject({ searchViewOpen: false, inboxViewOpen: false, notesViewOpen: false });
    expect(deps.setAutomationsViewOpen).toHaveBeenCalledWith(false);
    expect(deps.focusOpenSession).toHaveBeenCalledWith("s");
  });

  it("queues the prepared workers for the lead's tab and inspects a detailed one", async () => {
    const request = { leadId: "lead", workers: [worker] };
    vi.mocked(prepareOrchestrationWorkerDetails).mockResolvedValue(request);
    const { store, panes } = setup();

    panes.openDetails(worker);
    await vi.waitFor(() => expect(store.getState().workerDetailRequest).toEqual(request));

    expect(store.getState().inspectedWorkerId).toBe("w");
    expect(vi.mocked(prepareOrchestrationWorkerDetails).mock.calls[0][0]).toEqual([worker]);
  });

  it("queues nothing when no worker could be prepared", async () => {
    vi.mocked(prepareOrchestrationWorkerDetails).mockResolvedValue({ leadId: "lead", workers: [] });
    const { store, panes } = setup();

    panes.openAgents([worker]);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().workerDetailRequest).toBeNull();
  });

  it("closes a working-rail agent over the close deps", () => {
    const { deps, panes } = setup();

    panes.closeLiveAgent("s");

    expect(closeLiveAgent).toHaveBeenCalledWith(deps.closeLive, "s");
  });
});
