import type { WorkspaceHandlers } from "../../handlers/workspace-handlers";
import type { HistoryFlows } from "./use-history-flows";
import type { OrchestrationFlows } from "./use-orchestration-flows";
import type { ProjectFlows } from "./use-project-flows";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import type { SubmissionFlows } from "./use-submission-flows";
import type { SurfaceFlows } from "./use-surface-flows";
import type { TabFlows } from "./use-tab-flows";
import type { TurnQueueFlows } from "./use-turn-queue-flows";
import type { WorkspaceFlowCore } from "./workspace-flow-core";

/** Every domain hook's flows, in the order the Workspace builds them. */
export type WorkspaceFlowBundles = {
  tab: TabFlows;
  openers: SessionOpenerFlows;
  surface: SurfaceFlows;
  history: HistoryFlows;
  project: ProjectFlows;
  submission: SubmissionFlows;
  turnQueue: TurnQueueFlows;
  orchestration: OrchestrationFlows;
};

/** The handlers the Workspace still builds itself, ahead of its lifecycle effects. */
export type OwnWorkspaceHandlers = Pick<WorkspaceHandlers, "btw" | "turns" | "inbox" | "linkedPanels" | "linkedUpdateCards">;

export type TitleTabHandlers = Pick<WorkspaceHandlers, "navigation" | "displayedTabs" | "visibleTabs" | "remoteSnapshot">;

export function createWorkspaceHandlers(
  core: WorkspaceFlowCore,
  flows: WorkspaceFlowBundles,
  own: OwnWorkspaceHandlers,
  titleTabs: TitleTabHandlers,
): WorkspaceHandlers {
  const { tab, openers, surface, history, project, turnQueue } = flows;

  return {
    ...own,
    ...titleTabs,
    composer: project.composerActions,
    composerCards: turnQueue.composerCards,
    familiarView: core.familiarView,
    familiars: surface.familiarActions,
    files: project.fileActions,
    history: history.historyActions,
    inboxAsk: surface.inboxAsk,
    newSessions: tab.newSessions,
    prefetchSession: core.loader.prefetch,
    projects: project.projectActions,
    providerAccounts: turnQueue.providerAccounts,
    queue: turnQueue.queueActions,
    secondOpinions: turnQueue.secondOpinions,
    sessionOpeners: openers.sessionOpeners,
    submission: flows.submission.submission,
    surfaces: surface.surfaces,
    tabClose: tab.tabClose,
    tabs: openers.tabActions,
    terminals: tab.terminals,
    usageLimits: turnQueue.usageLimits,
    workerPanes: flows.orchestration.workerPanes,
    worktrees: history.worktreeActions,
  };
}
