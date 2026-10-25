import { useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import { DEFAULT_RUNTIME_MODE } from "@/domain/session/runtime-mode";
import { listFamiliars } from "@/features/familiars/model/familiar";
import { ensureFamiliarSession } from "@/features/familiars/model/familiar-workspace";
import { useQuickComposerLaunches } from "@/features/quick-composer/hooks/use-quick-composer-launches";
import { getSession } from "@/features/sessions/data/session-store";
import { newDefaultSession } from "@/features/sessions/model/session";
import { homeDir } from "@/platform/tauri/fs";
import { useFamiliarHabits } from "../../../hooks/use-familiar-habits";
import { useFamiliarTurnClose } from "../familiars/use-familiar-turn-close";
import { useOrchestrationFlows } from "../flows/use-orchestration-flows";
import { useSubmissionFlows } from "../flows/use-submission-flows";
import { useTurnQueueFlows } from "../flows/use-turn-queue-flows";
import type { WorkspaceFlowCore } from "../flows/workspace-flow-core";
import { useAutoContinue } from "../use-auto-continue";
import { useAutomationSchedule } from "../use-automation-schedule";
import { useControlRequests } from "../use-control-requests";
import { useEscapeStop } from "../use-escape-stop";
import { useOrchestrationSync } from "../use-orchestration-sync";
import { useOrchestratorBinding } from "../use-orchestrator-binding";
import { useQueueDispatch } from "../use-queue-dispatch";
import { useUsageLimitTimers } from "../use-usage-limit-timers";
import { useWorkerDetailPanes } from "../use-worker-detail-panes";
import { useWorkspaceCompanion } from "../use-workspace-companion";
import { useWorkspaceTaskBoard } from "../use-workspace-task-board";
import type { WorkspaceFlowsInput } from "./types";
import type { useOpeningFlows } from "./use-opening-flows";

/** Submission, automations, the Task Board, the turn queue, orchestration and the companion, with their effects. */
export function useRunningFlows(
  flowCore: WorkspaceFlowCore,
  input: WorkspaceFlowsInput,
  opening: ReturnType<typeof useOpeningFlows>,
) {
  const { core, harness, sessionDefaults } = input;
  const { sessions, sessionsRef, setSessions, tabs } = core;
  const { turnActions } = harness;
  const { flush: flushHarnessEvents, enqueue: enqueueHarnessEvent } = harness.harnessEvents;
  const { tabFlows, openerFlows, historyFlows } = opening;
  const { sessionOpeners } = openerFlows;
  const { projectActions, composerActions } = opening.projectFlows;

  const submissionFlows = useSubmissionFlows(flowCore, {
    activeSessionIdRef: input.activeSessionIdRef,
    projectLocationSyncs: core.projectLocationSyncs,
    editedResends: core.editedResends,
    enqueueHarnessEvent,
    flushHarnessEvents,
    tabFlows,
    sessionOpeners,
    reminders: opening.surfaceFlows.reminders,
    projectActions,
    composerActions,
    noteReply: input.noteReply,
  });
  const { submission, familiarHabitHost, automationRuns, familiarCompletions } = submissionFlows;
  useFamiliarHabits(familiarHabitHost);

  useFamiliarTurnClose(familiarCompletions, sessions);

  useQuickComposerLaunches(automationRuns.launchQuick);
  const { taskBoard, isMainWindow, railBadges } = useWorkspaceTaskBoard({
    launch: (launch, id, onSettled) =>
      automationRuns.launchQuick(launch, id, undefined, onSettled, false),
    sessions: () => sessionsRef.current,
    loadSession: getSession,
    stop: async (id) => {
      await flushSync(() => turnActions.stop(id));
      flushHarnessEvents();
    },
  });
  const taskBoardRef = useRef(taskBoard);
  taskBoardRef.current = taskBoard;

  useAutomationSchedule(automationRuns);

  const turnQueueFlows = useTurnQueueFlows(flowCore, {
    enqueueHarnessEvent,
    flushHarnessEvents,
    tabFlows,
    place: openerFlows.place,
    submission,
    activeSessionId: input.activeChatId,
  });
  const { turnQueue, usageLimits } = turnQueueFlows;

  useQueueDispatch(sessions, turnQueue, submission.submit);
  useUsageLimitTimers(sessions, turnQueue, usageLimits.resume);

  const unseenFinishedRef = useRef(input.unseenFinishedIds);
  unseenFinishedRef.current = input.unseenFinishedIds;

  useAutoContinue(sessions, harness.turnControl.sessions, submission.send);

  const orchestrationFlows = useOrchestrationFlows(flowCore, {
    flushHarnessEvents,
    submission,
    automationRuns,
    familiarCompletions,
    worktreeDeps: historyFlows.worktreeDeps,
    historyActions: historyFlows.historyActions,
    turnActions,
    tabFlows,
    sessionOpeners,
    composerActions,
    board: () => taskBoardRef.current,
    setDismissedLiveAgentIds: input.setDismissedLiveAgentIds,
    unseenFinishedRef,
    projectTerminalFocusedRef: core.projectTerminalFocusedRef,
  });

  useEscapeStop(orchestrationFlows.escapeStop);

  useWorkspaceCompanion({
    taskBoard,
    sessions: () => sessionsRef.current,
    // History spans visited projects; phones need it so Open sessions is not
    // limited to tabs currently mounted in memory.
    sessionHistory: () => core.history,
    familiars: () => (core.familiarsEnabled ? listFamiliars() : []),
    unseen: () => unseenFinishedRef.current,
    openFamiliar: async (familiarId) =>
      (await ensureFamiliarSession(familiarId, {
        home: homeDir,
        load: sessionOpeners.ensureOpen,
        create: (path) => newDefaultSession(path, sessionDefaults?.runtimeMode),
        add: (created) => {
          sessionsRef.current = [...sessionsRef.current, created];
          setSessions(sessionsRef.current);
        },
      })) ?? undefined,
    openSession: async (sessionId) =>
      (await sessionOpeners.ensureOpen(sessionId)) ?? undefined,
    submit: (sessionId, text, attachments) =>
      submission.submit(sessionId, text, attachments),
    stop: (sessionId) => turnActions.stop(sessionId),
    setRuntimeMode: composerActions.changeRuntimeMode,
    approve: turnActions.approve,
    answer: turnActions.answer,
    launch: (launch, id) => automationRuns.launchQuick(launch, id),
    defaultRuntimeMode: () => sessionDefaults?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
  });

  useOrchestrationSync(core.orchestrationRuns, sessions, tabs, core.activeTabId, orchestrationFlows.orchestrationSync);

  useOrchestratorBinding(orchestrationFlows.orchestratorBinding, submission.submit);
  useControlRequests(orchestrationFlows.controlRequests);

  useWorkerDetailPanes(tabs, core.workerDetailRequest, orchestrationFlows.workerDetailPanes);

  const { inspectedWorkerId, setInspectedWorkerId } = core;
  const { openDetails } = orchestrationFlows.workerPanes;
  const orchestrationWorkers = useMemo(
    () => ({ selectedId: inspectedWorkerId, inspect: setInspectedWorkerId, openDetails }),
    [inspectedWorkerId, setInspectedWorkerId, openDetails],
  );

  return { submissionFlows, taskBoard, isMainWindow, railBadges, turnQueueFlows, orchestrationFlows, orchestrationWorkers };
}
