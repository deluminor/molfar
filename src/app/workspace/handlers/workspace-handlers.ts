import { createContext, useContext } from "react";
import type { createBtw } from "../flows/btw/btw-actions";
import type { createComposerActions } from "../flows/composer/composer-actions";
import type { createComposerCardActions } from "../flows/composer/composer-cards";
import type { createProviderAccountActions } from "../flows/composer/provider-account";
import type { createFamiliarActions } from "../flows/familiars/familiar-actions";
import type { createFamiliarView } from "../flows/familiars/familiar-view";
import type { createFileActions } from "../flows/files/file-actions";
import type { createLinkedUpdateCards } from "../flows/linked-work-items/linked-update-card";
import type { createLinkedWorkItemPanels } from "../flows/linked-work-items/linked-work-item-panel";
import type { createWorkerPaneActions } from "../flows/orchestration-workers/worker-pane-actions";
import type { createProjectActions } from "../flows/projects/project-actions";
import type { createRemoteSnapshotSync } from "../flows/remote-sessions/remote-snapshot";
import type { createSecondOpinionActions } from "../flows/second-opinion/second-opinion-actions";
import type { createSessionHistoryActions } from "../flows/session-history/session-history-actions";
import type { createSubmissionActions } from "../flows/submission/submission-actions";
import type { createNavigationActions } from "../flows/surfaces/navigation-actions";
import type { createSurfaceActions } from "../flows/surfaces/surface-actions";
import type { createTabCloseActions } from "../flows/tabs/close/tab-close-actions";
import type { createNewSessionActions } from "../flows/tabs/new-session/new-session-actions";
import type { createSessionOpenerActions } from "../flows/tabs/session-opener-actions";
import type { createTabActions } from "../flows/tabs/tab-actions";
import type { createTerminalActions } from "../flows/terminals/terminal-actions";
import type { createTurnControlActions } from "../flows/turn-control/turn-control-actions";
import type { createTurnQueueActions } from "../flows/turn-queue/turn-queue-actions";
import type { createUsageLimits } from "../flows/turn-queue/usage-limits";
import type { createWorktreeActions } from "../flows/worktrees/worktree-actions";
import type { createDisplayedTabs } from "../title-tabs/displayed-tabs";

/** The workspace's action objects, each created once, so the value never changes after boot. */
export type WorkspaceHandlers = {
  btw: ReturnType<typeof createBtw>;
  composer: ReturnType<typeof createComposerActions>;
  composerCards: ReturnType<typeof createComposerCardActions>;
  displayedTabs: ReturnType<typeof createDisplayedTabs>;
  familiarView: ReturnType<typeof createFamiliarView>;
  familiars: ReturnType<typeof createFamiliarActions>;
  files: ReturnType<typeof createFileActions>;
  history: ReturnType<typeof createSessionHistoryActions>;
  linkedPanels: ReturnType<typeof createLinkedWorkItemPanels>;
  linkedUpdateCards: ReturnType<typeof createLinkedUpdateCards>;
  navigation: ReturnType<typeof createNavigationActions>;
  newSessions: ReturnType<typeof createNewSessionActions>;
  prefetchSession: (sessionId: string) => void;
  projects: ReturnType<typeof createProjectActions>;
  providerAccounts: ReturnType<typeof createProviderAccountActions>;
  queue: ReturnType<typeof createTurnQueueActions>;
  remoteSnapshot: ReturnType<typeof createRemoteSnapshotSync>;
  secondOpinions: ReturnType<typeof createSecondOpinionActions>;
  sessionOpeners: ReturnType<typeof createSessionOpenerActions>;
  submission: ReturnType<typeof createSubmissionActions>;
  surfaces: ReturnType<typeof createSurfaceActions>;
  tabClose: ReturnType<typeof createTabCloseActions>;
  tabs: ReturnType<typeof createTabActions>;
  terminals: ReturnType<typeof createTerminalActions>;
  turns: ReturnType<typeof createTurnControlActions>;
  usageLimits: ReturnType<typeof createUsageLimits>;
  workerPanes: ReturnType<typeof createWorkerPaneActions>;
  worktrees: ReturnType<typeof createWorktreeActions>;
};

export const WorkspaceHandlersContext = createContext<WorkspaceHandlers | null>(null);

export function useWorkspaceHandlers(): WorkspaceHandlers {
  const handlers = useContext(WorkspaceHandlersContext);
  if (!handlers) throw new Error("useWorkspaceHandlers needs a WorkspaceHandlersContext provider");
  return handlers;
}
