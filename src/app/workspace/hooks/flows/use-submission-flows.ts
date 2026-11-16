import type { AutomationDeps } from "../../flows/automations/automation-deps";
import { createAutomationRuns } from "../../flows/automations/automation-runs";
import { createFamiliarChat } from "../../flows/familiars/familiar-chat";
import { createFamiliarCompletions } from "../../flows/familiars/familiar-completions";
import { createFamiliarHabitHost, type FamiliarHabitHostDeps } from "../../flows/familiars/habit-host";
import { createSubmissionActions } from "../../flows/submission/submission-actions";
import type { SubmissionDeps } from "../../flows/submission/submission-deps";
import { useStableFlow } from "../use-stable-flow";
import type { ProjectFlows } from "./use-project-flows";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import type { SurfaceFlows } from "./use-surface-flows";
import type { TabFlows } from "./use-tab-flows";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

export type SubmissionFlowsInput = Pick<
  SubmissionDeps,
  "activeSessionIdRef" | "projectLocationSyncs" | "editedResends" | "enqueueHarnessEvent" | "flushHarnessEvents"
> & {
  tabFlows: TabFlows;
  sessionOpeners: SessionOpenerFlows["sessionOpeners"];
  reminders: Pick<SurfaceFlows["reminders"], "dismissContinuedNotices">;
  projectActions: Pick<ProjectFlows["projectActions"], "moveLocation">;
  composerActions: Pick<ProjectFlows["composerActions"], "saveDraft">;
  noteReply: FamiliarHabitHostDeps["noteReply"];
};

export function createSubmissionFlows(core: WorkspaceFlowCore, input: SubmissionFlowsInput) {
  const { store, sessionsRef, setSessions, turnGen, removingSessionIds } = core;
  const { sessionOpeners, activeSessionIdRef } = input;
  const commitSessions: FamiliarHabitHostDeps["commitSessions"] = (next) => {
    sessionsRef.current = next;
    setSessions(next);
  };

  const submission = createSubmissionActions({
    sessionsRef,
    setSessions,
    turnGen,
    activeSessionIdRef,
    removingSessionIds,
    switchingWorktrees: core.switchingWorktrees,
    removingWorktreePaths: core.removingWorktreePaths,
    projectLocationSyncs: input.projectLocationSyncs,
    workspacePins: core.workspacePins,
    editedResends: input.editedResends,
    workspaceNavigation: core.navigation,
    enqueueHarnessEvent: input.enqueueHarnessEvent,
    flushHarnessEvents: input.flushHarnessEvents,
    dismissNoticesForContinuedSession: (sessionId) => input.reminders.dismissContinuedNotices(sessionId),
    applyProjectLocationChange: (from, to) => input.projectActions.moveLocation(from, to),
  });

  const familiarChat = createFamiliarChat({
    openSessions: () => sessionsRef.current,
    commitSessions,
    persist: (session) => core.persistence.persist(session),
    schedule: (run, ms) => window.setTimeout(run, ms),
  });

  const familiarHabitHost = createFamiliarHabitHost({
    sessionsRef,
    activeSessionIdRef,
    chat: familiarChat,
    commitSessions,
    ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
    submitSession: submission.submit,
    stopSessionForRemoval: (sessionId) => core.stopSessionForRemoval(sessionId),
    noteReply: input.noteReply,
  });

  const automationDeps: AutomationDeps = {
    store,
    sessionsRef,
    setSessions,
    tabsRef: core.tabsRef,
    appendTab: (tab, cwd) => input.tabFlows.tabLayout.append(tab, cwd),
    selectTab: (tabId) => core.selectTab(tabId),
    setComposerFocused: (focused) => core.setComposerFocused(focused),
    focusOpenSession: (sessionId) => sessionOpeners.focusOpen(sessionId),
    setSidebarTab: (tab, project) => core.setSidebarTab(tab, project),
    closeAutomations: () => core.setAutomationsViewOpen(false),
    submitSession: submission.submit,
    saveDraft: (...args) => input.composerActions.saveDraft(...args),
  };
  const automationRuns = createAutomationRuns(automationDeps);

  const familiarCompletions = createFamiliarCompletions({
    ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
    isRemoving: (sessionId) => removingSessionIds.current.has(sessionId),
    setSessions,
    isBusyOnTurn: (familiarId, turn) => {
      const familiar = sessionsRef.current.find((session) => session.id === familiarId);
      return !!familiar?.busy && turnGen.current.get(familiarId) === turn;
    },
  });

  return { submission, familiarChat, familiarHabitHost, automationRuns, familiarCompletions };
}

export type SubmissionFlows = ReturnType<typeof createSubmissionFlows>;

/** Submission, the Familiar chat and habits, automation runs and Familiar completions, created once. */
export function useSubmissionFlows(core: WorkspaceFlowCore, input: SubmissionFlowsInput): SubmissionFlows {
  return useStableFlow(() => createSubmissionFlows(core, input));
}
