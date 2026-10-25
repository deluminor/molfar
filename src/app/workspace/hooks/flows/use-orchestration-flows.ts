import type { Dispatch, SetStateAction } from "react";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { upsertSession } from "@/features/sessions/data/session-store";
import type { AgentAppDeps } from "../../flows/agent-app/agent-app-deps";
import { createControlRequests } from "../../flows/agent-app/control-requests";
import type { WorkerDeps } from "../../flows/orchestration-workers/worker-deps";
import { createProposalActions } from "../../flows/orchestration-workers/proposal-actions";
import { createWorkerPaneActions } from "../../flows/orchestration-workers/worker-pane-actions";
import type { CloseLiveAgentDeps } from "../../flows/turn-control/close-live-agent";
import type { TurnControlActions } from "../../flows/turn-control/turn-control-actions";
import { checkOpenWorktreeFiles } from "../../flows/worktrees/worktree-removal";
import type { EscapeStopDeps } from "../use-escape-stop";
import type { OrchestrationSyncDeps } from "../use-orchestration-sync";
import { useStableFlow } from "../use-stable-flow";
import type { WorkerDetailPaneDeps } from "../use-worker-detail-panes";
import type { HistoryFlows } from "./use-history-flows";
import type { ProjectFlows } from "./use-project-flows";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import type { SubmissionFlows } from "./use-submission-flows";
import type { TabFlows } from "./use-tab-flows";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

export type OrchestrationFlowsInput = Pick<WorkerDeps, "flushHarnessEvents"> &
  Pick<SubmissionFlows, "submission" | "automationRuns" | "familiarCompletions"> &
  Pick<HistoryFlows, "worktreeDeps" | "historyActions"> & {
    turnActions: Pick<TurnControlActions, "stop">;
    tabFlows: TabFlows;
    sessionOpeners: SessionOpenerFlows["sessionOpeners"];
    composerActions: Pick<ProjectFlows["composerActions"], "saveDraft">;
    board: AgentAppDeps["board"];
    setDismissedLiveAgentIds: Dispatch<SetStateAction<Set<string>>>;
    unseenFinishedRef: { readonly current: Set<string> };
    projectTerminalFocusedRef: { readonly current: boolean };
  };

export function createOrchestrationFlows(core: WorkspaceFlowCore, input: OrchestrationFlowsInput) {
  const { store, sessionsRef, setSessions, tabsRef } = core;
  const { turnActions, sessionOpeners, submission } = input;
  const { tabClose } = input.tabFlows;

  const closeLiveAgentDeps: CloseLiveAgentDeps = {
    sessions: () => sessionsRef.current,
    tabs: () => tabsRef.current,
    dismiss: (sessionId) => {
      input.setDismissedLiveAgentIds((prev) => {
        if (prev.has(sessionId)) return prev;
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });
      input.unseenFinishedRef.current.delete(sessionId);
    },
    stop: (sessionId) => turnActions.stop(sessionId),
    closeTab: (tabId) => tabClose.closeTab(tabId),
    persist: (session) => core.persistence.persist(session),
    updateTabs: (update) => core.setTabs(update),
  };

  const escapeStop: EscapeStopDeps = {
    store,
    sessions: () => sessionsRef.current,
    tabs: () => tabsRef.current,
    activeTabId: () => core.activeTabIdRef.current,
    terminalFocused: () => input.projectTerminalFocusedRef.current,
    stop: (sessionId) => turnActions.stop(sessionId),
  };

  const orchestrationSync: OrchestrationSyncDeps = {
    setSessions,
    setTabs: core.setTabs,
    setActiveTabId: (tabId) => core.selectTab(tabId),
  };

  const orchestratorBinding: Omit<WorkerDeps, "submitSession"> = {
    store,
    sessionsRef,
    setSessions,
    stop: (sessionId, managed) => turnActions.stop(sessionId, managed),
    flushHarnessEvents: input.flushHarnessEvents,
    checkOpenWorktreeFiles: (path) => checkOpenWorktreeFiles(input.worktreeDeps, path),
  };

  const controlRequests = createControlRequests({
    sessionsRef,
    setSessions,
    turnGen: core.turnGen,
    removingSessionIds: core.removingSessionIds,
    switchingWorktrees: core.switchingWorktrees,
    completions: input.familiarCompletions.batches,
    board: () => input.board(),
    flushHarnessEvents: input.flushHarnessEvents,
    ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
    submitSession: submission.submit,
    saveDraft: (...args) => input.composerActions.saveDraft(...args),
    stopSession: turnActions.stop,
    removeSession: input.historyActions.remove,
    launchQuickSession: input.automationRuns.launchQuick,
  });

  const workerPanes = createWorkerPaneActions({
    store,
    sessionsRef,
    setAutomationsViewOpen: core.setAutomationsViewOpen,
    focusOpenSession: (sessionId) => sessionOpeners.focusOpen(sessionId),
    selectHistorySession: (sessionId) => sessionOpeners.selectHistory(sessionId),
    ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
    closeLive: closeLiveAgentDeps,
  });

  const workerDetailPanes: WorkerDetailPaneDeps = {
    store,
    sessionsRef,
    projectCwd: () => core.projectCwdRef.current,
    selectTab: (tabId) => core.selectTab(tabId),
    setComposerFocused: (focused) => core.setComposerFocused(focused),
  };

  const proposalActions = createProposalActions({
    sessionsRef,
    confirming: { current: new Set<string>() },
    orchestrator,
    setSessions: (next) => setSessions(next),
    saveSession: (session) => upsertSession(session),
    submit: submission.send,
  });
  const orchestrationActions = {
    ...proposalActions,
    open: workerPanes.openSession,
    openAgents: workerPanes.openAgents,
  };

  return {
    escapeStop,
    orchestrationSync,
    orchestratorBinding,
    controlRequests,
    workerPanes,
    workerDetailPanes,
    orchestrationActions,
  };
}

export type OrchestrationFlows = ReturnType<typeof createOrchestrationFlows>;

/** Live agent closing, orchestration hooks' deps, control requests, worker panes and proposals, created once. */
export function useOrchestrationFlows(core: WorkspaceFlowCore, input: OrchestrationFlowsInput): OrchestrationFlows {
  return useStableFlow(() => createOrchestrationFlows(core, input));
}
