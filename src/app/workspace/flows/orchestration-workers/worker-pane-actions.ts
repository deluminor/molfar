import type { Session } from "@/domain/session/session";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { prepareOrchestrationWorkerDetails } from "@/features/orchestration/model/orchestration-workspace";
import type { OrchestrationWorkerDetail } from "@/features/orchestration/ui/orchestration-actions";
import type { WorkspaceStore } from "../../store/types";
import { closeLiveAgent, type CloseLiveAgentDeps } from "../turn-control/close-live-agent";

export type WorkerPaneDeps = {
  store: WorkspaceStore;
  sessionsRef: { current: Session[] };
  setAutomationsViewOpen(open: boolean): void;
  /** False when no open tab holds the session. */
  focusOpenSession(sessionId: string): boolean;
  selectHistorySession(sessionId: string): Promise<unknown>;
  ensureOpenSession(sessionId: string): Promise<Session | null | undefined>;
  closeLive: CloseLiveAgentDeps;
};

/** Opening a session, its run's workers and the working rail's agents, created once for the workspace. */
export function createWorkerPaneActions(deps: WorkerPaneDeps) {
  const { store } = deps;
  const hasSession = (id: string) => deps.sessionsRef.current.some((session) => session.id === id);

  const focusOrOpen = (sessionId: string) => {
    if (!deps.focusOpenSession(sessionId)) void deps.selectHistorySession(sessionId);
  };

  /** A worker opens inside its lead's tab, inspected; any other session in its own. */
  const openSession = (sessionId: string): void => {
    const parentId =
      deps.sessionsRef.current.find((session) => session.id === sessionId)?.orchestrationLeadId ??
      orchestrator.forSession(sessionId)?.leadId;
    if (parentId && parentId !== sessionId) {
      store.getState().setInspectedWorkerId(sessionId);
      focusOrOpen(parentId);
      return;
    }
    focusOrOpen(sessionId);
  };

  const openAgents = (workers: OrchestrationWorkerDetail[]): void => {
    // Finished workers are not open; load stored transcripts before the
    // tabs appear so the pane does not flash the empty state.
    void prepareOrchestrationWorkerDetails(workers, {
      openLead: async (leadId) => {
        if (!deps.focusOpenSession(leadId)) await deps.selectHistorySession(leadId);
      },
      openWorker: deps.ensureOpenSession,
      hasSession,
    })
      .then((request) => {
        if (request?.workers.length) store.getState().setWorkerDetailRequest(request);
      })
      .catch(console.error);
  };

  return {
    openSession,
    openAgents,
    openDetails: (worker: OrchestrationWorkerDetail) => {
      store.getState().setInspectedWorkerId(worker.sessionId);
      openAgents([worker]);
    },
    selectLiveAgent: (sessionId: string) => {
      const { setSearchViewOpen, setInboxViewOpen, setNotesViewOpen } = store.getState();
      setSearchViewOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      deps.setAutomationsViewOpen(false);
      openSession(sessionId);
    },
    closeLiveAgent: (sessionId: string) => {
      void closeLiveAgent(deps.closeLive, sessionId);
    },
  };
}
