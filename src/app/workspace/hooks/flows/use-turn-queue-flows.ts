import { updateSessionState } from "../../../model/session-state";
import { createComposerCardActions } from "../../flows/composer/composer-cards";
import { createProviderAccountActions } from "../../flows/composer/provider-account";
import { createSecondOpinionActions } from "../../flows/second-opinion/second-opinion-actions";
import { createTurnQueueActions } from "../../flows/turn-queue/turn-queue-actions";
import type { TurnQueueDeps } from "../../flows/turn-queue/turn-queue-deps";
import { createUsageLimits } from "../../flows/turn-queue/usage-limits";
import { useStableFlow } from "../use-stable-flow";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import type { SubmissionFlows } from "./use-submission-flows";
import type { TabFlows } from "./use-tab-flows";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

export type TurnQueueFlowsInput = Pick<TurnQueueDeps, "enqueueHarnessEvent" | "flushHarnessEvents"> & {
  tabFlows: TabFlows;
  place: SessionOpenerFlows["place"];
  submission: Pick<SubmissionFlows["submission"], "send">;
  /** The session the composer is on, as last rendered. */
  activeSessionId(): string | undefined;
};

export function createTurnQueueFlows(core: WorkspaceFlowCore, input: TurnQueueFlowsInput) {
  const { sessionsRef, setSessions } = core;
  const { tabLayout } = input.tabFlows;

  const turnQueue: TurnQueueDeps = {
    sessions: () => sessionsRef.current,
    updateSessions: (update) => setSessions(update),
    updateSessionsNow: (update) => {
      updateSessionState(sessionsRef, setSessions, update);
    },
    submit: input.submission.send,
    enqueueHarnessEvent: input.enqueueHarnessEvent,
    flushHarnessEvents: input.flushHarnessEvents,
  };
  const queueActions = createTurnQueueActions(turnQueue);
  const usageLimits = createUsageLimits(turnQueue);

  const providerAccounts = createProviderAccountActions({
    activeSessionId: () => input.activeSessionId(),
    sessions: () => sessionsRef.current,
    updateSessions: (update) => updateSessionState(sessionsRef, setSessions, update),
    continueLimited: (sessionId, accountId) => void usageLimits.changeAccount(sessionId, accountId),
    appendTab: tabLayout.append,
    setActiveTabId: (tabId) => core.selectTab(tabId),
    setComposerFocused: core.setComposerFocused,
  });

  const secondOpinions = createSecondOpinionActions({
    beside: {
      ...input.place,
      activeTabIdRef: core.activeTabIdRef,
      appendTab: (tab, cwd) => tabLayout.append(tab, cwd),
    },
    submit: input.submission.send,
  });

  const composerCards = createComposerCardActions(setSessions);

  return { turnQueue, queueActions, usageLimits, providerAccounts, secondOpinions, composerCards };
}

export type TurnQueueFlows = ReturnType<typeof createTurnQueueFlows>;

/** The turn queue, usage limits, provider accounts, second opinions and composer cards, created once. */
export function useTurnQueueFlows(core: WorkspaceFlowCore, input: TurnQueueFlowsInput): TurnQueueFlows {
  return useStableFlow(() => createTurnQueueFlows(core, input));
}
