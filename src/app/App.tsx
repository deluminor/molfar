import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { alertApp, confirmApp, getAppDialog } from "@/shared/lib/app-dialog";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useStore } from "zustand";
import { useStableValue } from "@/shared/hooks/use-stable-value";
import {
  appViewTabId,
  familiarTabId,
  type AppView,
} from "@/features/workspace/model/app-view-tabs";
import { flushSync } from "react-dom";
import { commitTabSwitch } from "./model/navigation-performance";
import { SessionStateContext } from "@/features/sessions/model/session-state-store";
import { useWorkspaceSessions } from "./workspace/hooks/use-workspace-sessions";
import type { AppSessionPlacement } from "@/features/agent-app/model/agent-app";
import type { CiRepairRequest } from "@/features/inbox/model/ci-repair";
import { ciRepairSessions } from "@/features/inbox/model/ci-repair-sessions";
import { createHarnessEventPipeline } from "./workspace/flows/harness-events/harness-event-pipeline";
import { isForegroundSession } from "./workspace/flows/harness-events/foreground-session";
import { refreshProjectHistory } from "./workspace/flows/session-history/refresh-history";
import { createSessionPersistence } from "./workspace/flows/session-history/session-persistence";
import { createSessionLoader } from "./workspace/flows/session-history/session-loader";
import {
  pinSession,
  renameSession,
  type SessionActionsDeps,
} from "./workspace/flows/session-history/session-actions";
import type { SessionRemovalChangeDeps } from "./workspace/flows/session-history/session-removal-change";
import {
  openSavedSession,
  type OpenSavedSessionDeps,
} from "./workspace/flows/session-history/open-saved-session";
import { useIdleSessionDetach } from "./hooks/use-idle-session-detach";
import { useWorkspaceNavigation } from "./hooks/use-workspace-navigation";
import { updateSessionState } from "./model/session-state";
import { activeWorkspaceTab } from "./model/active-workspace-tab";
import type { SettingsReturnView } from "./model/settings-return/types";
import type { SubmissionAcceptance } from "./model/submission-acceptance";

import {
  prefetchProjectFiles,
} from "@/features/files/model/file-index";
import { useInboxActivity } from "@/features/inbox/hooks/use-inbox-unseen";
import { FamiliarSettingsPanel } from "./workspace/ui/familiars/FamiliarSettingsPanel";
import { FamiliarOverviewPanel } from "./workspace/ui/familiars/FamiliarOverviewPanel";
import {
  applyInsetLayout,
  INSET_LAYOUT_DEFAULT,
  loadInsetLayout,
  subscribeInsetLayout,
  type SidebarTabId,
} from "@/features/settings/model/appearance";
import {
  loadProjectSidebarTab,
  saveProjectSidebarTab,
} from "@/features/settings/model/project-sidebar-tab";
import { useProjectBranches } from "@/features/source-control/hooks/use-project-branches";
import {
  type WorktreeFocus,
  useWorktreeFocus,
} from "@/features/source-control/model/worktree-focus";
import type { Worktree } from "@/features/source-control/model/worktrees";
import {
  homeDir,
  type GitHistoryCommit,
} from "@/platform/tauri/fs";
import { pathKey, projectName } from "@/shared/lib/paths";
import type { GitFileDiffKind } from "@/domain/git/working-tree";
import { HAS_NATIVE_GLASS, IS_MAC } from "@/shared/lib/platform";
import { getUpdatePrompt } from "@/features/updates/model/update-prompt";
import { noteProjectStep } from "./shell/Sidebar";
import { createWorkspaceStore } from "./workspace/store/create-workspace-store";
import { useWorkspaceActions } from "./workspace/hooks/use-workspace-actions";
import { useWorkspaceField } from "./workspace/hooks/use-workspace-field";
import { shownFamiliarSession } from "./workspace/store/familiars-slice";
import { useStableFlow } from "./workspace/hooks/use-stable-flow";
import { useFamiliarRail } from "./workspace/hooks/familiars/use-familiar-rail";
import { useFamiliarOverviewData } from "./workspace/hooks/familiars/use-familiar-overview-data";
import {
  forgetOverviewDocument,
  leaveOverviewItems,
  openOverviewDocument,
} from "./workspace/flows/familiars/familiar-overview";
import { createFamiliarView } from "./workspace/flows/familiars/familiar-view";
import { createBtw } from "./workspace/flows/btw/btw-actions";
import { submitSession as submitToSession } from "./workspace/flows/submission/submit-session";
import type { Submit } from "./workspace/flows/submission/submit-types";
import { buildPlan, updatePlan } from "./workspace/flows/turn-queue/plan-block";
import {
  editQueuedMessage,
  removeQueuedMessage,
  resumeQueue,
  setQueuedMessageEditing,
  steerQueuedMessage,
} from "./workspace/flows/turn-queue/queue-actions";
import type { TurnQueueDeps } from "./workspace/flows/turn-queue/turn-queue-deps";
import { dismissComposerCard } from "./workspace/flows/composer/composer-cards";
import { repairChecks } from "./workspace/flows/inbox/ci-repair";
import { createInboxAsk } from "./workspace/flows/inbox/inbox-ask";
import type { InboxDeps } from "./workspace/flows/inbox/inbox-deps";
import { inboxRelatedSessions as relatedInboxSessions } from "./workspace/flows/inbox/inbox-related-sessions";
import { openInboxSession, startInboxItem } from "./workspace/flows/inbox/inbox-start";
import { setHistorySessionLinkedWorkItem } from "./workspace/flows/linked-work-items/history-link";
import { createLinkedUpdateCards } from "./workspace/flows/linked-work-items/linked-update-card";
import { createLinkedWorkItemPanels } from "./workspace/flows/linked-work-items/linked-work-item-panel";
import { addNoteToChat } from "./workspace/flows/notes/add-note-to-chat";
import { useAddNoteToChat } from "./workspace/hooks/use-add-note-to-chat";
import {
  changeBranch,
  changeWorkspaceMode,
  changeWorktreeBase,
} from "./workspace/flows/worktrees/session-checkout";
import { changeSessionProject } from "./workspace/flows/worktrees/session-project";
import type { WorktreeDeps } from "./workspace/flows/worktrees/worktree-deps";
import {
  checkOpenWorktreeFiles,
  checkRemoval,
  removeSessionWorktree,
} from "./workspace/flows/worktrees/worktree-removal";
import { changeWorktree } from "./workspace/flows/worktrees/worktree-switch";
import {
  pickProjects,
  selectProject,
  selectWorkspace,
} from "./workspace/flows/projects/open-projects";
import type { ProjectDeps } from "./workspace/flows/projects/project-deps";
import { moveProjectLocation } from "./workspace/flows/projects/project-location";
import { removeProject } from "./workspace/flows/projects/remove-project";
import { placeInFolder } from "./workspace/flows/projects/session-folder";
import type { FileDeps } from "./workspace/flows/files/file-deps";
import { fileDeleted, fileMoved } from "./workspace/flows/files/file-paths";
import {
  pinFile,
  selectFileSurface,
  setFileDirty,
  setFileErrorCount,
} from "./workspace/flows/files/file-state";
import { openFile, openPlan } from "./workspace/flows/files/open-file";
import type { ComposerDeps } from "./workspace/flows/composer/composer-deps";
import {
  changeModel,
  changeModelSettings,
  changeRuntimeMode,
} from "./workspace/flows/composer/composer-model";
import { removeDraft, saveDraft } from "./workspace/flows/composer/drafts";
import { useAddToChat } from "./workspace/hooks/use-add-to-chat";
import type { AutomationDeps } from "./workspace/flows/automations/automation-deps";
import { createAutomationRuns } from "./workspace/flows/automations/automation-runs";
import { launchQuickSession as launchQuickSessionInWorkspace } from "./workspace/flows/automations/quick-launch";
import { useAutomationSchedule } from "./workspace/hooks/use-automation-schedule";
import { useOrchestratorBinding } from "./workspace/hooks/use-orchestrator-binding";
import type { PaneDeps } from "./workspace/flows/tabs/pane-deps";
import { detachPane, focusPane } from "./workspace/flows/tabs/pane-focus";
import { selectHistorySession } from "./workspace/flows/tabs/select-history-session";
import {
  type ProviderAccountDeps,
  selectProviderAccount,
} from "./workspace/flows/composer/provider-account";
import { openBoardCard } from "./workspace/flows/surfaces/board-surface";
import { stepProject } from "./workspace/flows/surfaces/project-navigation";
import {
  togglePrimarySidebar,
  toggleProjectRail,
  toggleSessionSidebar,
  toggleSessionSidebarShortcut,
} from "./workspace/flows/surfaces/sidebar-toggles";
import { useRightPanel, useRightPanelSlide } from "./workspace/hooks/use-right-panel";
import { useTitleTabState } from "./workspace/hooks/use-title-tab-state";
import type { CommandDeps, WorkspaceActions } from "./workspace/hooks/commands/command-deps";
import { useCommandRunner } from "./workspace/hooks/commands/use-command-runner";
import { useMenuCommands } from "./workspace/hooks/commands/use-menu-commands";
import { useNativeKeybindings } from "./workspace/hooks/commands/use-native-keybindings";
import { useWorkspaceKeys } from "./workspace/hooks/commands/use-workspace-keys";
import { useLatestRef } from "./workspace/hooks/use-latest-ref";
import type { AgentAppDeps } from "./workspace/flows/agent-app/agent-app-deps";
import { createControlRequests } from "./workspace/flows/agent-app/control-requests";
import { useControlRequests } from "./workspace/hooks/use-control-requests";
import { confirmDiscardUnsaved } from "./model/confirm-discard-unsaved";
import {
  removeSession,
  type RemoveSessionDeps,
} from "./workspace/flows/session-removal/remove-session";
import { titleTabList } from "./workspace/title-tabs/title-tab-list";
import { titleTabsEqual } from "./workspace/title-tabs/title-tabs-equal";
import { createDisplayedTabs } from "./workspace/title-tabs/displayed-tabs";
import type {
  DisplayedTabNavigation,
  DisplayedTabsDeps,
  VisibleTabs,
} from "./workspace/title-tabs/displayed-tabs-deps";
import { createVisibleTabShortcuts } from "./workspace/title-tabs/visible-tab-shortcuts";
import {
  navigateSessionList,
  type SessionListDeps,
} from "./workspace/flows/tabs/session-list-navigation";
import type { SurfaceDeps } from "./workspace/flows/surfaces/surface-deps";
import {
  findInProject,
  openAppView,
  openAutomationSession,
  openFilePicker,
  railBack,
  railForward,
} from "./workspace/flows/surfaces/overlay-views";
import {
  closeSettings,
  openNotificationSettings,
  openSettings as openSettingsSurface,
  selectSettingsSection,
} from "./workspace/flows/surfaces/settings-surface";
import { createUsageLimits } from "./workspace/flows/turn-queue/usage-limits";
import { useQueueDispatch } from "./workspace/hooks/use-queue-dispatch";
import { useUsageLimitTimers } from "./workspace/hooks/use-usage-limit-timers";
import { closeLiveAgent, type CloseLiveAgentDeps } from "./workspace/flows/turn-control/close-live-agent";
import { compactContext } from "./workspace/flows/turn-control/compact-context";
import { handoffSession } from "./workspace/flows/turn-control/handoff-session";
import {
  answerApproval,
  answerQuestion,
  type HarnessReplyDeps,
  keepQuestionOpen,
} from "./workspace/flows/turn-control/harness-replies";
import { stopTurn } from "./workspace/flows/turn-control/stop-turn";
import type { TurnControlDeps } from "./workspace/flows/turn-control/turn-control-deps";
import { useAutoContinue } from "./workspace/hooks/use-auto-continue";
import { useEscapeStop } from "./workspace/hooks/use-escape-stop";
import { createFamiliarChat } from "./workspace/flows/familiars/familiar-chat";
import { createFamiliarCompletions } from "./workspace/flows/familiars/familiar-completions";
import { useWorkspaceCompanion } from "./workspace/hooks/use-workspace-companion";
import { useWorkspaceTaskBoard } from "./workspace/hooks/use-workspace-task-board";
import { createTabVisits } from "./workspace/flows/tabs/tab-visits";
import { cycleTab, tabInSlot } from "./workspace/flows/tabs/tab-cycle";
import {
  activateTab as activateWorkspaceTab,
  focusOpenSession as focusTabOfSession,
  replaceBlankPaneWithSession as replaceBlankPane,
  type TabFocusDeps,
  type TabSelectReason,
} from "./workspace/flows/tabs/tab-focus";
import {
  appendTab as appendWorkspaceTab,
  insertBeside as insertTabBeside,
  insertBesideActive as insertTabBesideActiveTab,
  movePaneTo,
  openSessionTab as openWorkspaceSessionTab,
  reorderPaneFiles,
  reorderTabs as reorderWorkspaceTabs,
  splitFocusedPane,
  type TabLayoutDeps,
} from "./workspace/flows/tabs/tab-layout";
import { initialWorkspaceState } from "./workspace/store/initial-workspace";
import type { TerminalDeps } from "./workspace/flows/terminals/terminal-deps";
import {
  closeOtherProjectTerminals,
  closeProjectTerminal,
  focusedDockTerminal as focusedDockTerminalOf,
  focusProjectTerminal as focusDockTerminal,
  hideProjectTerminal,
  reorderProjectTerminals,
  selectProjectTerminal,
  setProjectTerminalSide,
  setProjectTerminalSize,
  toggleProjectTerminal,
} from "./workspace/flows/terminals/dock-terminals";
import {
  changeTerminalMeta,
  openTerminal,
  openTerminalInSession,
  toggleRunningTerminal,
} from "./workspace/flows/terminals/workspace-terminals";
import type { TabCloseDeps } from "./workspace/flows/tabs/close/tab-close-deps";
import {
  closeOtherTabs,
  closeTab,
  closeTabs,
} from "./workspace/flows/tabs/close/tab-close";
import {
  closeFile,
  closeOtherFiles,
} from "./workspace/flows/tabs/close/file-close";
import { closeDeletedRemoteSession } from "./workspace/flows/tabs/close/tab-clear";
import {
  closeAllTabs,
  closeEveryTab,
} from "./workspace/flows/tabs/close/tab-close-all";
import {
  closePane,
  closeTitleTab,
} from "./workspace/flows/tabs/close/pane-close";
import { WorkspaceSidebar } from "./workspace/ui/WorkspaceSidebar";
import { WorkspaceTitleBar } from "./workspace/ui/WorkspaceTitleBar";

import {
  orchestrator,
  type ControlOutcome,
} from "@/features/orchestration/model/orchestration";
import {
  attachOrchestrationWorkers,
  consolidateOrchestrationTabs,
  prepareOrchestrationWorkerDetails,
} from "@/features/orchestration/model/orchestration-workspace";
import {
  OrchestrationActions,
  OrchestrationWorkers,
  type OrchestrationWorkerDetail,
} from "@/features/orchestration/ui/orchestration-actions";
import {
  findProjectTerminal,
  type DockSide,
} from "@/features/projects/model/project-terminal";

import {
  sessionChildHarnesses,
} from "@/features/sessions/model/handoff";
import {
  mergeModelSettings,
  resolveModel,
} from "@/integrations/harness/core/models/resolve-model";
import {
  confirmCloseTerminal,
  confirmCloseTerminals,
} from "@/features/terminal/model/terminal-close";
import {
  newTerminalCwd,
  type TerminalMetaPatch,
} from "@/features/terminal/model/terminal-tab";
import {
  bindHarnessSession,
  cancelHarnessTurn,
  forgetHarnessSession,
  migrateFamiliarCodexSession,
  isLiveHarness,
  pickTextHarness,
  probeHarnessAvailability,
  refreshHarnessCatalogs,
  registerBuiltinHarnesses,
  startHarnessBridge,
  stopHarnessSession,
  configureHarnessIdlePark,
  stopHarnessTextPrompts,
  type ApprovalDecision,
  type UserQuestionReply,
} from "@/integrations/harness";

import {
  focusedFileTab,
  isFilesystemTab,
  isolateTerminalPanes,
  leafIds,
  neighborLeafId,
  newAgentTab,
  newTab,
  openChangesTab,
  openCommitTab,
  openEditorTab,
  splitPane,
  type FocusDir,
  type PaneEdge,
  type SplitDir,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";



import {
  releaseNotesForVersion,
} from "@/features/updates/model/release-notes";

import type { WindowTransferPayload } from "./model/window-transfer";

import type { OpenFileFn } from "@/features/search/model/search";
import {
  finishSessionTurn,
  flushSessionCheckpoint,
} from "@/features/sessions/model/checkpoint";
import {
  createEditedResendCoordinator,
} from "@/features/sessions/model/edit-last-turn";

import {
  rememberProjectLocation,
  type synchronizeProjectLocation,
} from "@/features/projects/model/project-location";
import {
  isRemoteProjectPath,
  lastProjectPath,
  looksLikeProject,
  rememberProject,
  sameProjectPath,
} from "@/features/projects/model/recents";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import type { ProviderAccountProvider } from "@/domain/harness/provider-account";
import { newWorkspaceSession } from "./model/new-workspace-session";
import {
  newDefaultSession,
  newSession,
} from "@/features/sessions/model/session";
import {
  formatSessionTitle,
  sessionDisplayTitle,
} from "@/domain/session/title";
import {
  sessionWorkCwd,
  sessionNeedsInput,
} from "@/domain/session/session-state";
import type {
  LinkedWorkItem,
  Session,
  WorkspaceMode,
} from "@/domain/session/session";
import type { Block } from "@/domain/session/block";
import type { Attachment } from "@/domain/session/attachment";
import type {
  ModelTarget,
  PlanBuildTarget,
} from "@/domain/session/turn";
import { type RuntimeMode, DEFAULT_RUNTIME_MODE } from "@/domain/session/runtime-mode";
import type { HarnessId } from "@/domain/harness/harness";
import {
  applyPlaceTabOnPane,
  filterTabsForProject,
  workspaceTabCwd,
  workspaceTabWorktree,
} from "@/features/workspace/model/workspace-tab-groups";

import {
  listAutomations,
} from "@/features/automations/model/automations";
import {
  loadNotes,
} from "@/features/notes/notes";
import type { NoteComposerCard } from "@/domain/notes/note-card";
import { useInputNotifications } from "@/features/notifications/hooks/use-input-notifications";
import { useSessionReminders } from "@/features/notifications/hooks/use-session-reminders";
import { hiddenApprovalNotices } from "@/features/notifications/model/approval-toast";
import { syncDockBadge } from "@/features/notifications/model/dock-badge";
import {
  loadNotificationsEnabled,
  probeNotificationPermission,
  setWindowFocused,
} from "@/features/notifications/model/notifications";
import { useQuickComposerLaunches } from "@/features/quick-composer/hooks/use-quick-composer-launches";
import type { QuickLaunch } from "@/features/quick-composer/model/quick-composer";
import {
  deleteSession,
  getSession,
  readSession,
  repairSession,
  listLinkedSessions,
  listSessionsByProject,
  replaceInFlightSessions,
  saveWorkspaceSnapshot,
  setSessionArchived,
  setSessionPinned,
  upsertSession,
  type SessionSummary,
} from "@/features/sessions/data/session-store";
import { archiveFocusedSession } from "@/features/sessions/model/archive-shortcut";
import { liveAgentsFromSessions } from "@/features/sessions/model/live-agents";
import { useUnseenFinishedSessions } from "@/features/sessions/hooks/use-unseen-finished-sessions";
import { useUnseenReplyCounts } from "@/features/sessions/hooks/use-unseen-reply-counts";
import {
  buildSecondOpinionRequest,
  harnessForTurn,
  SECOND_OPINION_TITLE,
} from "@/features/sessions/model/second-opinion";
import {
  createFamiliar,
  findFamiliar,
  listFamiliars,
  loadOpenFamiliar,
  familiarForSession,
  familiarsSnapshot,
  saveOpenFamiliar,
  subscribeFamiliars,
} from "@/features/familiars/model/familiar";
import {
  deleteFamiliar,
  resetFamiliar,
  type FamiliarRemovalDeps,
} from "./workspace/flows/familiars/familiar-removal";
import { openDiff, type OpenDiffDeps } from "./workspace/flows/files/open-diff";
import { placeSessionOnPane, type PlaceSessionDeps } from "./workspace/flows/tabs/place-session";
import { createProposalActions } from "./workspace/flows/orchestration-workers/proposal-actions";
import { useFamiliarHabits } from "./hooks/use-familiar-habits";
import { useDockSlide } from "./workspace/hooks/use-dock-slide";
import { createFamiliarHabitHost } from "./workspace/flows/familiars/habit-host";
import { useFloatingFamiliar } from "./hooks/use-floating-familiar";
import {
  detachFamiliarTabs,
  ensureFamiliarSession,
} from "@/features/familiars/model/familiar-workspace";
import type { SessionFolderTarget } from "@/features/sessions/model/session-folders";
import { nativeSkillContextForSession } from "@/features/sessions/model/session-skills";
import {
  TranscriptPool,
  TranscriptPoolOutlet,
} from "@/features/sessions/ui/TranscriptPool";
import {
  removeArtifactCard,
  ARTIFACT_DELETED_EVENT,
} from "@/features/artifacts/artifacts";
import type { MonoChangesRequest } from "@/features/familiars/ui/FamiliarChangesView";
import {
  warmNativeSkills,
} from "@/features/skills/model/skills";
import {
  OPEN_CONNECTIONS_EVENT,
  OPEN_REMOTE_PROJECT_EVENT,
  rememberRemoteSession,
  REMOTE_HISTORY_UPDATED,
  remoteTabCwd,
} from "@/features/connections/model/connections";
import type { HostSession } from "@/domain/remote/protocol";
import {
  remotePath,
  remoteProjectFor,
  remoteSessionGitCwd,
} from "@/features/connections/model/remote-projects";
import { remoteSessionState } from "@/features/connections/model/remote-session-state";
import { findRemoteSessionTab } from "@/features/connections/model/remote-session-tabs";
import type { InboxItem } from "@/features/inbox/model/github-tasks";
import type { ConnectableInboxSource } from "@/features/inbox/model/inbox-filters";
import { SessionPane } from "@/features/sessions/ui/SessionPane";
import { SessionSurface } from "@/features/sessions/ui/SessionSurface";
import type { SettingsAnchor } from "@/features/settings/ui/SettingsView";
import {
  AutomationsView,
  InboxView,
  LinkedWorkItemPanel,
  NotesView,
} from "./workspace/ui/app-views/lazy-views";
import {
  isBusySession,
  openSessionIds,
} from "./model/session-id-sets";
import { useProviderSignInPrompt } from "./workspace/hooks/use-provider-sign-in-prompt";
import { useSessionIdSet } from "./workspace/hooks/use-session-id-set";
import {
  selectedChangeKind,
  selectedChangePath,
  selectedCommitSha,
} from "./model/selected-change";
import { WorkspaceAppViews } from "./workspace/ui/app-views/WorkspaceAppViews";
import { WorkspacePickerDialogs } from "./workspace/ui/notices/WorkspacePickerDialogs";
import { InsetRightPanel } from "./workspace/ui/workspace-chrome/InsetRightPanel";
import { WorkspaceMenuBar } from "./workspace/ui/workspace-chrome/WorkspaceMenuBar";
import { WorkspaceSettings } from "./workspace/ui/workspace-chrome/WorkspaceSettings";
import { WorkspaceUsageFooter } from "./workspace/ui/workspace-chrome/WorkspaceUsageFooter";
import { FamiliarSessionPanes } from "./workspace/ui/workspace-main/FamiliarSessionPanes";
import { LinkedWorkItemPanels } from "./workspace/ui/workspace-main/LinkedWorkItemPanels";
import { ProjectTerminalDocks } from "./workspace/ui/workspace-main/ProjectTerminalDocks";
import type { SharedPaneProps } from "./workspace/ui/workspace-main/types";
import { WorkspaceTabPanes } from "./workspace/ui/workspace-main/WorkspaceTabPanes";
import { WorkspaceDialogs } from "./workspace/ui/notices/WorkspaceDialogs";
import { WorkspaceNotices } from "./workspace/ui/notices/WorkspaceNotices";
import { useLocalSurfaceActions } from "./model/local-surfaces/use-local-surface-actions";
import { useLocalSurfaceState } from "./model/local-surfaces/use-local-surface-state";
import { preloadNavigationWhenIdle } from "./model/preload-navigation";
import { LocalSurfaceViews } from "./ui/LocalSurfaceViews";


import { markLinkedSessionUpdateSeen } from "@/features/inbox/model/linked-session-seen";
import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";

import {
  loadCloseToTray,
  loadFamiliarsEnabled,
  subscribeFamiliarsEnabled,
  loadIdleAgentLimit,
  loadLiveAgentsEnabled,
  loadNotesEnabled,
  subscribeLiveAgentsEnabled,
  subscribeNotesEnabled,
  type SettingsSectionId,
} from "@/features/settings/model/settings";

import {
  isBlankSession,
  reconcileProjectReturn,
  type ProjectReturnMemory,
} from "@/features/projects/model/project-return";
import {
  historyWithLiveSessions,
  mergeProjectHistorySummary,
  sameSessionSummaries,
  summaryFromSession,
} from "@/features/sessions/data/session-history";
import {
  inFlightRefs,
  inFlightSnapshotKey,
  shouldWriteInFlightSnapshot,
} from "@/features/sessions/model/in-flight";
import {
  collectWorkspaceSnapshot,
  workspaceSnapshotKey,
} from "@/features/workspace/model/workspace-snapshot";
import {
  bindResumedSessions,
  closeBusyWindow,
  closeCurrentWindow,
  confirmReload,
  hasInFlightSessions,
  hideCurrentWindow,
  isAppQuitting,
  persistLiveTranscripts,
  persistQuitState,
  reapWindowRuntime,
  setQuitWorkspace,
  type ResumedWorkspace,
} from "./model/app-lifecycle";
import type { InstalledUpdate } from "@/features/updates/model/update-notice";

// Register capabilities before composer hooks choose their discovery strategy.
registerBuiltinHarnesses();

type AppProps = {
  windowTransfer?: WindowTransferPayload | null;
  resumed?: ResumedWorkspace | null;
  installedUpdate?: InstalledUpdate | null;
  history?: SessionSummary[];
  historyCwd?: string | null;
};

export default function App(props: AppProps) {
  return (
    <Suspense fallback={null}>
      <Workspace {...props} />
    </Suspense>
  );
}

function Workspace({
  windowTransfer = null,
  resumed = null,
  installedUpdate = null,
  history: bootHistory = [],
  historyCwd: bootHistoryCwd = null,
}: AppProps) {
  const workspaceStore = useStableFlow(() =>
    createWorkspaceStore(
      initialWorkspaceState({
        windowTransfer,
        resumed,
        history: bootHistory,
        historyCwd: bootHistoryCwd,
        installedUpdate,
      }),
    ),
  );
  const {
    setProjectCwd,
    setRecents,
    setTabs,
    setActiveTabId: setActiveTabIdState,
    setProjectTerminalFocused,
    setHistory,
    setStoredLinkedSessions,
    setFilePickerOpen,
    setSearchViewOpen,
    setInboxViewOpen,
    setLinkedWorkItemPanels,
    setNotesViewOpen,
    setInspectedWorkerId,
    setWorkerDetailRequest,
    setSettingsOpen,
    setWhatsNewVersion,
    setRemoteProjectDialogOpen,
    setFamiliarViewId,
    setFamiliarOverviewOpen,
    setFamiliarOverviewTab,
    setFamiliarSettingsFor,
    setFamiliarChangesRequest,
    setFamiliarShownSession,
    setFamiliarOverviewDocument,
  } = useWorkspaceActions(workspaceStore);
  const projectCwd = useWorkspaceField(workspaceStore, "projectCwd");
  const recents = useWorkspaceField(workspaceStore, "recents");
  const { sessions, setSessions, sessionsRef, sessionState } =
    useWorkspaceSessions(workspaceStore);
  const switchingWorktrees = useRef(new Map<string, string>());
  const removingWorktreePaths = useRef(new Set<string>());
  const deleteConfirmationPending = useRef(false);
  const tabs = useWorkspaceField(workspaceStore, "tabs");
  const projectTerminals = useWorkspaceField(workspaceStore, "projectTerminals");
  const lastDockSide = useWorkspaceField(workspaceStore, "lastDockSide");
  const lastDockSideRef = useRef(lastDockSide);
  lastDockSideRef.current = lastDockSide;
  const projectTerminalFocused = useWorkspaceField(workspaceStore, "projectTerminalFocused");
  const activeTabId = useWorkspaceField(workspaceStore, "activeTabId");
  const familiarViewId = useWorkspaceField(workspaceStore, "familiarViewId");
  const familiarOverviewOpen = useWorkspaceField(workspaceStore, "familiarOverviewOpen");
  const onOpenMonoArtifact = useCallback(
    (_sessionId: string, id: string) => openOverviewDocument(workspaceStore, id),
    [],
  );
  useEffect(() => {
    const listening = listen<string>(
      ARTIFACT_DELETED_EVENT,
      ({ payload: id }) => {
        const previous = sessionsRef.current;
        const updated = previous.map((session) =>
          removeArtifactCard(session, id),
        );
        if (updated.some((session, index) => session !== previous[index])) {
          sessionsRef.current = updated;
          setSessions(updated);
        }
        forgetOverviewDocument(workspaceStore, id);
      },
    );
    return () => {
      void listening.then((unlisten) => unlisten());
    };
  }, []);
  useEffect(() => {
    if (!familiarOverviewOpen) leaveOverviewItems(workspaceStore);
  }, [familiarOverviewOpen]);
  const familiarShownSessionFocused = useWorkspaceField(
    workspaceStore,
    "familiarShownSessionFocused",
  );
  const shownFamiliarSessionId = useStore(workspaceStore, shownFamiliarSession);
  const familiarView = useStableFlow(() =>
    createFamiliarView({
      store: workspaceStore,
      cancelNavigation: () => workspaceNavigation.cancel(),
      closeAutomations: () => setAutomationsViewOpen(false),
      openFamiliarTab: (familiarId) => {
        if (!insetLayoutRef.current) return;
        setOpenFamiliarTabs((current) =>
          current.includes(familiarId) ? current : [...current, familiarId],
        );
      },
      ensureOpenSession: (sessionId) => ensureOpenSession(sessionId),
      addSession: (created) => {
        sessionsRef.current = [...sessionsRef.current, created];
        setSessions(sessionsRef.current);
      },
      focusComposer: ({ retake }) => {
        setComposerFocused(true);
        if (retake) setComposerFocusToken((token) => token + 1);
      },
    }),
  );
  const closeFamiliarView = familiarView.close;
  const [composerFocused, setComposerFocused] = useState(() => {
    if (windowTransfer) return true;
    if (!resumed) return false;
    const tab =
      resumed.tabs.find((entry) => entry.id === resumed.activeTabId) ??
      resumed.tabs[0];
    return (
      !!tab && resumed.sessions.some((session) => session.id === tab.focusedId)
    );
  });
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  /** Tab id -> project name, kept in sync with the rendered title tabs. */
  const tabProjectsRef = useRef(new Map<string, string>());
  const displayedTabNavigation = useRef<DisplayedTabNavigation>({
    tabs: [],
    activeId: "",
  });
  const visibleTabsRef = useRef<VisibleTabs>({
    insetLayout: false,
    activeTabId: "",
    titleTabs: [],
  });
  const projectOfTab = useCallback(
    (id: string) => tabProjectsRef.current.get(id),
    [],
  );
  const projectRailOpen = useWorkspaceField(workspaceStore, "projectRailOpen");
  const tabCloseScope = "project" as const;
  const currentProjectDock = findProjectTerminal(projectTerminals, projectCwd);
  const dockVisible = !!currentProjectDock?.open;
  const searchViewOpen = useWorkspaceField(workspaceStore, "searchViewOpen");
  const inboxViewOpen = useWorkspaceField(workspaceStore, "inboxViewOpen");
  const linkedWorkItemPanels = useWorkspaceField(workspaceStore, "linkedWorkItemPanels");
  const inboxAskPortal = useWorkspaceField(workspaceStore, "inboxAskPortal");
  const notesViewOpen = useWorkspaceField(workspaceStore, "notesViewOpen");
  const localSurfaces = useLocalSurfaceState();
  const {
    localSurface,
    setLocalSurface,
    localSurfaceRef,
    automationsSurfaceOpen,
    setAutomationsSurfaceOpen,
    automationsSurfaceOpenRef,
    automationsFocusId,
    automationsViewOpen,
    setAutomationsViewOpen,
    railSurfaces,
  } = localSurfaces;
  const inspectedWorkerId = useWorkspaceField(workspaceStore, "inspectedWorkerId");
  const workerDetailRequest = useWorkspaceField(workspaceStore, "workerDetailRequest");
  const activeAppView: AppView | undefined = searchViewOpen
    ? "search"
    : inboxViewOpen
      ? "inbox"
      : notesViewOpen
        ? "notes"
        : automationsSurfaceOpen
          ? "automations"
          : undefined;
  const orchestrationRuns = useSyncExternalStore(
    orchestrator.subscribe,
    orchestrator.snapshot,
    orchestrator.snapshot,
  );
  const notesEnabled = useSyncExternalStore(
    subscribeNotesEnabled,
    loadNotesEnabled,
    () => true,
  );
  const liveAgentsEnabled = useSyncExternalStore(
    subscribeLiveAgentsEnabled,
    loadLiveAgentsEnabled,
    () => true,
  );
  const collapsedProjectRailMode = useWorkspaceField(workspaceStore, "collapsedProjectRailMode");
  const settingsOpen = useWorkspaceField(workspaceStore, "settingsOpen");
  const insetLayout = useSyncExternalStore(
    subscribeInsetLayout,
    loadInsetLayout,
    () => INSET_LAYOUT_DEFAULT,
  );
  const [insetRailHost, setInsetRailHost] = useState<HTMLDivElement | null>(
    null,
  );
  // Where Settings puts its breadcrumb and actions in the inset title bar.
  const [settingsHeaderHost, setSettingsHeaderHost] =
    useState<HTMLDivElement | null>(null);
  const insetLayoutRef = useRef(insetLayout);
  insetLayoutRef.current = insetLayout;
  const {
    host: rightPanelHost,
    setHost: setRightPanelHost,
    open: rightPanelOpen,
    tab: rightPanelTab,
    closing: rightPanelClosing,
    setClosing: setRightPanelClosing,
    show: showRightPanel,
    toggle: onToggleRightPanel,
    resize: rightPanelResize,
    paneRef: rightPanelRef,
    setPane: setRightPanelRef,
  } = useRightPanel();
  useLayoutEffect(() => {
    applyInsetLayout(insetLayout);
  }, [insetLayout]);
  // The title bar's navigation spans the open rail, so its tabs line up with
  // the card. Written straight to the shell to follow a rail drag per frame.
  useLayoutEffect(() => {
    const host = insetRailHost;
    const shell = host?.closest<HTMLElement>(".inset-shell");
    if (!host || !shell) return;
    const sync = () =>
      shell.style.setProperty("--inset-rail-width", `${host.offsetWidth}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(host);
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--inset-rail-width");
    };
  }, [insetRailHost]);
  const settingsReturnViewRef = useRef<SettingsReturnView>({
    search: false,
    inbox: false,
    notes: false,
    automations: false,
    localSurface: null,
  });
  const whatsNewVersion = useWorkspaceField(workspaceStore, "whatsNewVersion");
  const familiarsEnabled = useSyncExternalStore(
    subscribeFamiliarsEnabled,
    loadFamiliarsEnabled,
    () => true,
  );
  const familiarsSnap = useSyncExternalStore(subscribeFamiliars, familiarsSnapshot);
  const {
    openAppViews,
    setOpenAppViews,
    setOpenFamiliarTabs,
    titleTabOrder,
    setTitleTabOrder,
    rememberAppView,
    shownFamiliarTabs,
  } = useTitleTabState(tabs, insetLayout, familiarsEnabled, familiarsSnap);
  /** A Familiar hides the terminal, so reaching for one leaves it. */
  const leaveCoveringFamiliar = useCallback(() => {
    if (workspaceStore.getState().familiarViewId) closeFamiliarView();
  }, [closeFamiliarView]);
  const editorNavigationToken = useRef(0);
  const filePickerOpen = useWorkspaceField(workspaceStore, "filePickerOpen");
  const dirtyFiles = useWorkspaceField(workspaceStore, "dirtyFiles");
  const history = useWorkspaceField(workspaceStore, "history");
  const [, refreshRemoteTabTitles] = useState(0);
  useEffect(() => {
    const updated = () => refreshRemoteTabTitles((value) => value + 1);
    window.addEventListener(REMOTE_HISTORY_UPDATED, updated);
    return () => window.removeEventListener(REMOTE_HISTORY_UPDATED, updated);
  }, []);
  const storedLinkedSessions = useWorkspaceField(workspaceStore, "storedLinkedSessions");
  const loadedProjects = useWorkspaceField(workspaceStore, "loadedProjects");
  const historyErrorCwd = useWorkspaceField(workspaceStore, "historyErrorCwd");

  const btw = useStableFlow(() =>
    createBtw({
      openSessions: () => sessionsRef.current,
      commitSessions: (next) => {
        sessionsRef.current = next;
        setSessions(next);
      },
      persist: (session) => sessionPersistence.persist(session),
    }),
  );
  const linkedSessionUpdatesRef = useRef<
    ReadonlyMap<string, LinkedSessionUpdate>
  >(new Map());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const dirtyFilesRef = useRef(dirtyFiles);
  dirtyFilesRef.current = dirtyFiles;
  const projectTerminalsRef = useRef(projectTerminals);
  projectTerminalsRef.current = projectTerminals;
  const projectTerminalFocusedRef = useRef(projectTerminalFocused);
  projectTerminalFocusedRef.current = projectTerminalFocused;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  useLayoutEffect(() => commitTabSwitch(activeTabId), [activeTabId]);

  useLayoutEffect(() => {
    const migration = detachFamiliarTabs(
      tabs,
      sessions,
      activeTabId,
      projectCwd,
      (cwd) => newDefaultSession(cwd),
    );
    if (!migration) return;
    tabsRef.current = migration.tabs;
    sessionsRef.current = [...sessions, ...migration.addedSessions];
    setTabs(migration.tabs);
    setSessions(sessionsRef.current);
    setActiveTabIdState(migration.activeTabId);
    if (migration.agentViewId) {
      setFamiliarViewId(migration.agentViewId);
    }
  }, [tabs, sessions, activeTabId, projectCwd]);

  const projectWorktree = useWorktreeFocus(projectCwd);
  /** Tab or session id -> the workspace it was opened or moved in. A tab
   * belongs to the workspace it was opened in, whatever worktree it runs in:
   * opening a session, or moving one from its composer, never switches the
   * workspace. Unpinned tabs (restored ones) group by their own worktree. */
  // Only the default workspace's tabs were saved, so every restored tab
  // belongs to it, including one its composer moved to a worktree.
  const [restoredPins] = useState(
    () =>
      new Map(
        tabs.flatMap((tab) => {
          const project = workspaceTabCwd(tab, sessions);
          return project && !isRemoteProjectPath(project)
            ? [[tab.id, project] as const]
            : [];
        }),
      ),
  );
  const workspacePins = useRef(restoredPins);
  const tabWorkspace = useCallback(
    (tab: WorkspaceTab, list: readonly Session[]) => {
      const pinnedTab = workspacePins.current.get(tab.id);
      if (pinnedTab) return pinnedTab;
      for (const id of leafIds(tab.layout)) {
        const pinned = workspacePins.current.get(id);
        if (pinned) return pinned;
      }
      return workspaceTabWorktree(tab, list);
    },
    [],
  );

  /** Saved tabs: the app reopens on each project's default workspace, so
   * tabs from other worktrees close with it instead of piling up. */
  const keepWorkspaceTab = useCallback(
    (tab: WorkspaceTab) => {
      const project = workspaceTabCwd(tab, sessionsRef.current);
      if (!project || isRemoteProjectPath(project)) return true;
      const workspace = tabWorkspace(tab, sessionsRef.current);
      return !workspace || sameProjectPath(workspace, project);
    },
    [tabWorkspace],
  );

  const workspaceNavigation = useWorkspaceNavigation({
    project: projectCwd,
    activeTabId,
    tabs,
    sessions,
    pins: workspacePins.current,
    tabWorkspace,
    moveSession: (id, tree, isCurrent) =>
      onWorktreeChange(id, tree, false, isCurrent),
    activateTab: (id) => {
      if (tabsRef.current.some((tab) => tab.id === id)) {
        activateTab(id, undefined, "workspace");
      } else {
        // A newly created tab has not rendered into tabsRef yet.
        closeFamiliarView();
        setActiveTabIdState(id);
        setComposerFocused(true);
      }
    },
    createTab: (project, focus) => createWorkspaceTab(project, focus),
  });
  // Every ordinary tab activation supersedes an unfinished workspace request,
  // including opening a session in the same tab or selecting a project.
  const setActiveTabId = useCallback(
    (id: string) => {
      workspaceNavigation.cancel();
      closeFamiliarView();
      setActiveTabIdState(id);
    },
    [workspaceNavigation.cancel, closeFamiliarView],
  );

  const projectCwdRef = useRef(projectCwd);
  projectCwdRef.current = projectCwd;
  const searchViewOpenRef = useRef(searchViewOpen);
  searchViewOpenRef.current = searchViewOpen;
  const inboxViewOpenRef = useRef(inboxViewOpen);
  inboxViewOpenRef.current = inboxViewOpen;
  const foregroundSurfaceRef = useRef<{
    workspaceVisible: boolean;
    standaloneSessionId?: string;
    /** A session shown beside the Familiar's chat. */
    sideSessionId?: string;
  }>({ workspaceVisible: true });
  foregroundSurfaceRef.current = {
    workspaceVisible:
      !searchViewOpen &&
      !inboxViewOpen &&
      !notesViewOpen &&
      !automationsViewOpen &&
      !settingsOpen &&
      !familiarViewId,
    standaloneSessionId: inboxViewOpen
      ? inboxAskPortal?.sessionId
      : !searchViewOpen &&
          !notesViewOpen &&
          !automationsViewOpen &&
          !settingsOpen
        ? (familiarViewId ?? undefined)
        : undefined,
    sideSessionId:
      !inboxViewOpen &&
      !searchViewOpen &&
      !notesViewOpen &&
      !automationsViewOpen &&
      !settingsOpen
        ? shownFamiliarSessionId
        : undefined,
  };
  const notesViewOpenRef = useRef(notesViewOpen);
  notesViewOpenRef.current = notesViewOpen;
  const automationsViewOpenRef = useRef(automationsViewOpen);
  automationsViewOpenRef.current = automationsViewOpen;
  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;
  const sessionNavigationIdsRef = useRef<readonly string[]>([]);
  const filePickerOpenRef = useRef(filePickerOpen);
  filePickerOpenRef.current = filePickerOpen;
  const whatsNewVersionRef = useRef(whatsNewVersion);
  whatsNewVersionRef.current = whatsNewVersion;
  useEffect(() => {
    btw.abortClosed(new Set(sessions.map((session) => session.id)));
  }, [sessions]);

  useEffect(
    () => () => {
      btw.abortAll();
      void stopHarnessTextPrompts();
    },
    [],
  );

  useEffect(() => {
    if (!notesEnabled) setNotesViewOpen(false);
  }, [notesEnabled]);

  useEffect(
    () =>
      preloadNavigationWhenIdle([
        InboxView.preload,
        LinkedWorkItemPanel.preload,
        AutomationsView.preload,
        listAutomations,
        ...(notesEnabled ? [NotesView.preload, loadNotes] : []),
      ]),
    [notesEnabled],
  );

  const projectReturnRef = useRef<ProjectReturnMemory>(
    resumed?.projectReturnMemory ?? new Map(),
  );
  const readProjectReturnMemory = useCallback(() => {
    projectReturnRef.current = reconcileProjectReturn({
      memory: projectReturnRef.current,
      tabs: tabsRef.current,
      sessions: sessionsRef.current,
      activeTabId: activeTabIdRef.current,
    });
    return projectReturnRef.current;
  }, []);
  useEffect(() => {
    readProjectReturnMemory();
  }, [activeTabId, tabs, sessions, readProjectReturnMemory]);

  const tabVisits = useStableFlow(() =>
    createTabVisits(workspaceStore, activeTabId),
  );
  const turnGen = useRef(new Map<string, number>());
  const editedResends = useRef(createEditedResendCoordinator()).current;
  const inFlightSyncKey = useRef<string | null>(null);
  const sawInFlight = useRef(false);
  const workspaceSyncKey = useRef<string | null>(null);
  const removingSessionIds = useRef(new Set<string>());
  const sessionPersistence = useStableFlow(() =>
    createSessionPersistence({
      upsert: upsertSession,
      isBlocked: (sessionId) =>
        removingSessionIds.current.has(sessionId) ||
        switchingWorktrees.current.has(sessionId),
      onSaved: (summary) => {
        if (summary.cwd !== sidebarCwdRef.current) return;
        setHistory((current) => mergeProjectHistorySummary(current, summary));
      },
    }),
  );
  const loadedSessionCache = useRef(new Map<string, Session>());
  const openingSessionIds = useRef(new Set<string>());
  const sessionLoader = useStableFlow(() =>
    createSessionLoader({
      cache: loadedSessionCache.current,
      opening: openingSessionIds.current,
      get: readSession,
      isRemoving: (sessionId) => removingSessionIds.current.has(sessionId),
      isOpen: (sessionId) =>
        sessionsRef.current.some((session) => session.id === sessionId),
    }),
  );
  const [transcriptPool] = useState(() => new TranscriptPool());
  const skipForgetSessionIds = useRef(new Set<string>());
  const importedSessionsApplied = useRef(false);
  const projectLocationSyncs = useRef(
    new Map<string, ReturnType<typeof synchronizeProjectLocation>>(),
  );
  const submitAfterProjectSyncRef = useRef<Submit>(() => false);

  useEffect(() => {
    for (const project of recents) {
      void rememberProjectLocation(project.path).catch(() => undefined);
    }
  }, [recents]);

  useEffect(() => {
    if (importedSessionsApplied.current) return;
    const imported = windowTransfer?.sessions ?? resumed?.sessions;
    if (!imported?.length) return;
    importedSessionsApplied.current = true;
    for (const session of imported) sessionPersistence.markImported(session);
  }, [windowTransfer, resumed]);

  // Visible output advances per frame; hidden streams keep their own cadence.
  const harnessEvents = useStableFlow(() =>
    createHarnessEventPipeline({
      updateSessions: (update, textOnly) => {
        const previous = sessionsRef.current;
        const next = sessionState.update(update, textOnly);
        if (!textOnly && next !== previous) syncDockBadge(next);
      },
      isForeground: (sessionId) =>
        isForegroundSession(sessionId, {
          hidden: false,
          ...foregroundSurfaceRef.current,
          activeTab: tabsRef.current.find(
            (entry) => entry.id === activeTabIdRef.current,
          ),
        }),
    }),
  );
  // Cap warm agent CLIs, sparing the conversations on screen.
  useEffect(() => {
    configureHarnessIdlePark({
      limit: loadIdleAgentLimit,
      keep: harnessEvents.isForeground,
    });
  }, [harnessEvents]);
  const flushHarnessEvents = harnessEvents.flush;
  const flushForegroundHarnessEvents = harnessEvents.flushForeground;
  const enqueueHarnessEvent = harnessEvents.enqueue;
  const turnControl = useStableFlow(
    (): TurnControlDeps => ({
      sessions: () => sessionsRef.current,
      commitSessions: (next) => {
        sessionsRef.current = next;
        syncDockBadge(next);
        setSessions(next);
      },
      updateSessions: (update) => setSessions(update),
      turnGen: turnGen.current,
      enqueueHarnessEvent,
      flushHarnessEvents,
    }),
  );

  const stopSessionForRemoval = useCallback(
    async (sessionId: string): Promise<Session | undefined> => {
      await orchestrator.stopForSession(sessionId);
      const open = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!open?.busy) return open;

      turnGen.current.set(sessionId, (turnGen.current.get(sessionId) ?? 0) + 1);
      flushHarnessEvents();
      await Promise.all(
        sessionChildHarnesses(open).map(async (harness) => {
          await cancelHarnessTurn(harness, sessionId).catch(() => undefined);
          await stopHarnessSession(harness, sessionId);
        }),
      );
      await finishSessionTurn(sessionId, sessionWorkCwd(open));
      flushHarnessEvents();
      return sessionsRef.current.find((session) => session.id === sessionId);
    },
    [flushHarnessEvents],
  );

  useEffect(() => {
    if (resumed?.sessions.length) bindResumedSessions(resumed.sessions);
    const stopBridge = startHarnessBridge();
    const reap = () => {
      if (isAppQuitting()) return;
      void persistQuitState(
        sessionsRef.current,
        tabsRef.current,
        activeTabIdRef.current,
        projectCwdRef.current,
        readProjectReturnMemory(),
        "unload",
        projectTerminalsRef.current,
        lastDockSideRef.current ?? undefined,
      ).finally(() => {
        void reapWindowRuntime(
          sessionsRef.current,
          tabsRef.current,
          projectTerminalsRef.current,
        );
      });
    };
    window.addEventListener("pagehide", reap);
    window.addEventListener("beforeunload", reap);
    return () => {
      window.removeEventListener("pagehide", reap);
      window.removeEventListener("beforeunload", reap);
      stopBridge();
      harnessEvents.dispose();
    };
  }, [resumed, readProjectReturnMemory]);

  useEffect(() => {
    let cancelled = false;
    // Retain known existing Familiar threads before hiding their original entries.
    // Sending a turn uses the same migration lock, so it can safely overlap.
    void (async () => {
      for (const mono of listFamiliars()) {
        if (cancelled) return;
        if (!mono.sessionId) continue;
        try {
          const session =
            sessionsRef.current.find((s) => s.id === mono.sessionId) ??
            (await getSession(mono.sessionId));
          if (
            !session ||
            cancelled ||
            sessionsRef.current.find((s) => s.id === session.id)?.busy
          )
            continue;
          const cwd = sessionWorkCwd(session);
          if (!cwd || cwd === "~") continue;
          const threadIds = new Set<string>();
          if (session.harness === "codex" && session.providerSessionId)
            threadIds.add(session.providerSessionId);
          for (const block of session.blocks) {
            for (const thread of block.btwThreads ?? []) {
              if (
                (thread.harness ?? session.harness) === "codex" &&
                thread.providerThreadId
              )
                threadIds.add(thread.providerThreadId);
            }
          }
          for (const threadId of threadIds) {
            if (cancelled) return;
            await migrateFamiliarCodexSession({
              sessionId: session.id,
              threadId,
              cwd,
              providerAccountId: session.providerAccountId,
            });
          }
        } catch (error) {
          // Keep the original context intact; the next native operation retries.
          console.warn("Could not migrate saved Familiar Codex context", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familiarsSnap]);

  useEffect(() => {
    void probeHarnessAvailability();
    // Only the harnesses already in this window. Probing every installed CLI
    // at boot left unused agents (especially Pi) running in the background.
    const harnesses = [
      ...new Set(sessionsRef.current.map((session) => session.harness)),
    ];
    void refreshHarnessCatalogs(harnesses).then(() => {
      setSessions((prev) =>
        prev.map((session) => {
          if (!isLiveHarness(session.harness)) return session;
          const resolved = resolveModel(session.harness, session.model);
          const modelSettings = mergeModelSettings(
            resolved,
            session.modelSettings,
          );
          if (
            resolved.id === session.model &&
            sameSettings(modelSettings, session.modelSettings)
          ) {
            return session;
          }
          return { ...session, model: resolved.id, modelSettings };
        }),
      );
    });
  }, []);

  const activeTab = activeWorkspaceTab(tabs, activeTabId, sessions, projectCwd);
  const active =
    sessions.find((session) => session.id === activeTab?.focusedId) ??
    sessions.find(
      (session) => activeTab && leafIds(activeTab.layout).includes(session.id),
    );
  const familiarViewSession = familiarViewId
    ? sessions.find((session) => session.id === familiarViewId)
    : undefined;
  const familiarCovers = !!familiarViewId;
  // The open Familiar's title tab, in the inset layout.
  const familiarViewTabId = useMemo(() => {
    const familiarId = familiarViewId ? familiarForSession(familiarViewId)?.id : undefined;
    return familiarId ? familiarTabId(familiarId) : undefined;
    // The roster is read through its snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familiarViewId, familiarsSnap]);
  const activeTabSessionIds = activeTab ? leafIds(activeTab.layout) : [];
  const activeLinkedWorkItemPanel = activeTab
    ? (linkedWorkItemPanels.get(activeTab.focusedId) ??
      [...linkedWorkItemPanels.values()]
        .reverse()
        .find((panel) => activeTabSessionIds.includes(panel.sessionId)) ??
      null)
    : null;

  // Panels are tab-local UI. Keep mounted panels alive while their tab is in
  // the workspace so switching away preserves the fetched issue and its UI
  // state, then discard them when their session leaves every open tab.
  useEffect(() => {
    const openSessionIds = new Set(tabs.flatMap((tab) => leafIds(tab.layout)));
    setLinkedWorkItemPanels((current) => {
      if ([...current.keys()].every((id) => openSessionIds.has(id))) {
        return current;
      }
      return new Map([...current].filter(([id]) => openSessionIds.has(id)));
    });
  }, [tabs]);

  const sessionDefaults = active ?? sessions[0];

  const activeSkillContext = active
    ? nativeSkillContextForSession(active)
    : null;
  const activeSkillCwd = activeSkillContext?.cwd;

  useEffect(() => {
    if (!activeSkillContext || !activeSkillCwd) return;
    warmNativeSkills(activeSkillContext);
  }, [activeSkillCwd, active?.id, active?.harness]);

  const activeFile = activeTab ? focusedFileTab(activeTab) : undefined;
  // A Familiar belongs to no project, so its view keeps the project in place.
  const sidebarCwd =
    activeFile?.projectCwd ?? activeFile?.cwd ?? active?.cwd ?? projectCwd;
  const sidebarCwdRef = useRef(sidebarCwd);
  sidebarCwdRef.current = sidebarCwd;
  // Each inset space is one project, so its Inbox, Notes and Automations (and
  // the Inbox dot) show that project's items; the classic layout shows all.
  const appViewScope =
    insetLayout && looksLikeProject(sidebarCwd) ? sidebarCwd : undefined;
  const [sidebarTabSelection, setSidebarTabSelection] = useState<{
    project: string;
    tab: SidebarTabId;
  }>(() => ({
    project: pathKey(sidebarCwd),
    tab: loadProjectSidebarTab(sidebarCwd),
  }));
  const sidebarTab =
    sidebarTabSelection.project === pathKey(sidebarCwd)
      ? sidebarTabSelection.tab
      : loadProjectSidebarTab(sidebarCwd);
  const setSidebarTab = useCallback(
    (tab: SidebarTabId, project?: string) => {
      // Inset: Explorer and Changes open in the right panel; the sidebar stays
      // on the sessions.
      if (insetLayoutRef.current && (tab === "files" || tab === "changes")) {
        showRightPanel(tab);
        return;
      }
      const cwd = project ?? sidebarCwdRef.current;
      saveProjectSidebarTab(cwd, tab);
      setSidebarTabSelection({
        project: pathKey(cwd),
        tab: tab === "inbox" ? "sessions" : tab,
      });
    },
    [showRightPanel],
  );
  const newChatDefaultsRef = useRef({ active, sessionDefaults });
  newChatDefaultsRef.current = { active, sessionDefaults };
  const inboxDeps = useStableFlow(
    (): InboxDeps => ({
      store: workspaceStore,
      sessionsRef,
      setSessions,
      closeAutomations: () => setAutomationsViewOpen(false),
      setSidebarTab: (tab, project) => setSidebarTab(tab, project),
      openSessionTab: (session, cwd) => openSessionTab(session, cwd),
      selectTab: (tabId) => setActiveTabId(tabId),
      focusComposer: () => setComposerFocused(true),
      defaultCwd: () => {
        const { active, sessionDefaults } = newChatDefaultsRef.current;
        return active?.cwd || sessionDefaults?.cwd || projectCwdRef.current;
      },
      runtimeMode: () => newChatDefaultsRef.current.sessionDefaults?.runtimeMode,
      sidebarCwd: () => sidebarCwdRef.current,
      selectHistorySession: (sessionId) => onSelectHistorySession(sessionId),
      ensureOpenSession: (sessionId) => ensureOpenSession(sessionId),
      submit: (...args) => onSubmitRef.current(...args),
    }),
  );
  const linkedPanels = useStableFlow(() => createLinkedWorkItemPanels(inboxDeps));
  useAddToChat(
    useStableFlow(() => ({ ...inboxDeps, tabsRef, activeTabIdRef, projectCwdRef })),
    sessionDefaults?.cwd,
    sessionDefaults?.runtimeMode,
  );
  const linkedUpdateCards = useStableFlow(() =>
    createLinkedUpdateCards({
      sessionsRef,
      setSessions,
      linkedUpdates: () => linkedSessionUpdatesRef.current,
    }),
  );
  const sidebarCwdKey =
    sidebarCwd && sidebarCwd !== "~" ? normalizeProjectPath(sidebarCwd) : null;
  const historyFailed =
    sidebarCwdKey != null && historyErrorCwd === sidebarCwdKey;
  // True from the very first frame that shows a project we have never listed,
  // so the sidebar can stay blank instead of flashing "No sessions yet".
  const historyPending =
    sidebarCwdKey != null &&
    !loadedProjects.has(sidebarCwdKey) &&
    !historyFailed;
  const gitCwd =
    activeFile?.cwd ?? (active ? sessionWorkCwd(active) : sidebarCwd);
  const terminalCwd = newTerminalCwd({
    activeFile,
    session: active,
    fallback: sidebarCwd,
  });
  const terminalCwdRef = useRef(terminalCwd);
  terminalCwdRef.current = terminalCwd;
  const gitCwdBranches = useProjectBranches(
    gitCwd,
    Boolean(gitCwd) && gitCwd !== "~" && !isRemoteProjectPath(sidebarCwd),
  );
  const explorerRootLabel =
    active?.worktreeCwd && sameProjectPath(gitCwd, sessionWorkCwd(active))
      ? active.branch || gitCwdBranches?.current || undefined
      : undefined;
  const remoteFilesProject = remoteProjectFor(sidebarCwd);
  // The host checkout the remote tab is aimed at — the attached session's
  // work path or a worktree picked before the first message.
  const remoteTabCheckout = remoteFilesProject
    ? remoteTabCwd(sidebarCwd, active?.id)
    : undefined;
  const filesCwd = remoteFilesProject
    ? isRemoteProjectPath(gitCwd)
      ? gitCwd
      : remotePath(
          remoteFilesProject.environmentId,
          remoteTabCheckout ??
            (gitCwd && gitCwd !== sidebarCwd ? gitCwd : remoteFilesProject.cwd),
        )
    : gitCwd;
  // Git follows the session's own work path (a linked worktree included),
  // never the terminal-following files cwd: a remote session working in a
  // separate worktree diffed the main checkout and showed "No file changes".
  const gitRootCwd = remoteFilesProject
    ? remoteSessionGitCwd(
        remoteFilesProject,
        gitCwd,
        sidebarCwd,
        remoteTabCheckout,
      )
    : gitCwd;
  const gitCwdRef = useRef(gitRootCwd);
  gitCwdRef.current = gitRootCwd;
  const projectBranches = useProjectBranches(
    sidebarCwd,
    Boolean(sidebarCwd) && sidebarCwd !== "~",
  );

  const busySessionIds = useSessionIdSet(sessions, isBusySession);

  /** Probe the active session's harness for its live model catalog whenever
   * the active harness changes. Catalogs load lazily (probing spawns a CLI
   * process) and the boot refresh runs before restored sessions land, so a
   * fresh session would otherwise show only the built-in fallback model
   * until the picker happened to be opened. Idempotent: refreshHarnessCatalogs
   * dedupes via hasLiveCatalog and its inflight map. */
  const activeHarness = active?.harness;
  useEffect(() => {
    if (!activeHarness || !isLiveHarness(activeHarness)) return;
    void refreshHarnessCatalogs([activeHarness]);
  }, [activeHarness]);

  // The footer's usage follows what is in view: under the inset layout a
  // Familiar's tab keeps the footer, which then reads the Familiar's model.
  const usageSource =
    insetLayout && familiarViewSession ? familiarViewSession : active;
  useProviderSignInPrompt(workspaceStore, sessions, active);

  const approvalSessionIds = useSessionIdSet(sessions, sessionNeedsInput);

  const activeSessionId = inboxViewOpen
    ? inboxAskPortal?.sessionId
    : shownFamiliarSessionId && familiarShownSessionFocused
      ? shownFamiliarSessionId
      : (familiarViewSession?.id ?? active?.id);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  // Sessions that belong in the UI: a habit's hidden run is not one of them,
  // and asks through its Familiar's chat rather than on its own.
  const promptableSessions = useMemo(
    () => sessions.filter((session) => !session.ephemeral),
    [sessions],
  );
  useInputNotifications(promptableSessions, activeSessionId);

  // Cache the OS decision so a turn ending later can skip a denied banner.
  useEffect(() => {
    if (loadNotificationsEnabled()) void probeNotificationPermission();
  }, []);
  const unseenFinishedIds = useUnseenFinishedSessions(
    sessions,
    busySessionIds,
    activeSessionId,
  );
  /** Working-rail X dismissals — finished cards stay out until the session runs again. */
  const [dismissedLiveAgentIds, setDismissedLiveAgentIds] = useState(
    () => new Set<string>(),
  );
  const familiarSessionIds = useMemo(
    () =>
      new Set(
        listFamiliars().flatMap((familiar) => (familiar.sessionId ? [familiar.sessionId] : [])),
      ),
    // The roster is read through its snapshot.
    [familiarsSnap],
  );
  // How many replies each Familiar has that the user has not read, for the rail.
  const familiarReplies = useUnseenReplyCounts(
    familiarSessionIds,
    busySessionIds,
    activeSessionId,
  );

  const liveAgentRows = useMemo(() => {
    if (!liveAgentsEnabled) return [];
    return liveAgentsFromSessions(
      promptableSessions,
      unseenFinishedIds,
      new Set(
        listFamiliars().flatMap((familiar) =>
          familiar.sessionId ? [familiar.sessionId] : [],
        ),
      ),
    ).filter(
      (agent) => !agent.done || !dismissedLiveAgentIds.has(agent.id),
    );
  }, [
    liveAgentsEnabled,
    promptableSessions,
    unseenFinishedIds,
    familiarsSnap,
    dismissedLiveAgentIds,
  ]);
  // Rebuilt for every streamed batch; identity only moves when a row does.
  const liveAgents = useStableValue(liveAgentRows);

  const hiddenApprovalToasts = useMemo(
    () =>
      hiddenApprovalNotices(
        familiarViewId
          ? promptableSessions.filter((session) => session.id !== familiarViewId)
          : promptableSessions,
        familiarCovers ? "" : activeTabId,
        tabs,
        composerFocused,
      ),
    [
      promptableSessions,
      activeTabId,
      tabs,
      composerFocused,
      familiarViewId,
      familiarCovers,
    ],
  );
  // The footer's slot for the resource pressure chip. Monitoring continues
  // while the footer is hidden.
  const [pressureChipHost, setPressureChipHost] =
    useState<HTMLSpanElement | null>(null);

  useEffect(() => {
    syncDockBadge(sessions);
  }, [sessions]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        setWindowFocused(focused);
        if (focused) {
          flushForegroundHarnessEvents();
          syncDockBadge(sessionsRef.current);
          if (
            document.activeElement === document.body &&
            !projectTerminalFocusedRef.current &&
            !searchViewOpenRef.current &&
            !inboxViewOpenRef.current &&
            !notesViewOpenRef.current &&
            !automationsViewOpenRef.current &&
            !settingsOpenRef.current
          ) {
            setComposerFocused(true);
            setComposerFocusToken((token) => token + 1);
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [flushForegroundHarnessEvents]);

  useEffect(() => {
    const onVisible = () => {
      // Flush on hiding too: WebKit can suspend a pending animation frame,
      // leaving the last output stranded until another event or activation.
      flushHarnessEvents();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [flushHarnessEvents]);

  useLayoutEffect(() => {
    // Catch up only the newly visible panes before paint. Other streams keep
    // their background timer instead of adding work to this tab switch.
    flushForegroundHarnessEvents();
  }, [
    activeTabId,
    familiarViewId,
    inboxViewOpen,
    inboxAskPortal?.sessionId,
    shownFamiliarSessionId,
    searchViewOpen,
    notesViewOpen,
    automationsViewOpen,
    settingsOpen,
    flushForegroundHarnessEvents,
  ]);

  useEffect(() => {
    let unlistenClose: (() => void) | undefined;
    const releaseQuit = setQuitWorkspace(
      () => sessionsRef.current,
      () => tabsRef.current,
      () => activeTabIdRef.current,
      () => projectCwdRef.current,
      () => projectTerminalsRef.current,
      readProjectReturnMemory,
      flushHarnessEvents,
      () => lastDockSideRef.current,
      keepWorkspaceTab,
    );
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        // Listening here makes close our job. Letting the default path run
        // calls JS `window.destroy`, which Tauri denies without a permission.
        event.preventDefault();
        if (
          IS_MAC &&
          (await invoke<boolean>("familiar_chat_keep_alive").catch(() => false))
        ) {
          flushHarnessEvents();
          void persistLiveTranscripts(sessionsRef.current);
          void hideCurrentWindow();
          return;
        }
        const toTray = loadCloseToTray();
        if (hasInFlightSessions(sessionsRef.current)) {
          flushHarnessEvents();
          if (!toTray && !IS_MAC) {
            void closeBusyWindow();
            return;
          }
          // Not `persistQuitState`: that marks the live turns interrupted.
          void persistLiveTranscripts(sessionsRef.current);
          void hideCurrentWindow();
          return;
        }
        void persistQuitState(
          sessionsRef.current,
          tabsRef.current,
          activeTabIdRef.current,
          projectCwdRef.current,
          readProjectReturnMemory(),
          "unload",
          projectTerminalsRef.current,
          lastDockSideRef.current ?? undefined,
          keepWorkspaceTab,
        ).finally(() => {
          void (toTray ? hideCurrentWindow() : closeCurrentWindow());
        });
      })
      .then((fn) => {
        unlistenClose = fn;
      });
    return () => {
      releaseQuit();
      unlistenClose?.();
    };
  }, [flushHarnessEvents, keepWorkspaceTab, readProjectReturnMemory]);

  const refreshHistory = useCallback(
    (cwd: string) =>
      refreshProjectHistory(workspaceStore, cwd, {
        list: listSessionsByProject,
        sidebarCwd: () => sidebarCwdRef.current,
      }),
    [],
  );

  useEffect(() => {
    void refreshHistory(sidebarCwd);
  }, [sidebarCwd, refreshHistory]);

  useEffect(() => {
    if (!inboxViewOpen) return;
    let cancelled = false;
    void listLinkedSessions()
      .then((rows) => {
        if (!cancelled) setStoredLinkedSessions(rows);
      })
      .catch(() => {
        // Already-loaded and live sessions still provide a useful fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [inboxViewOpen]);

  useEffect(() => {
    prefetchProjectFiles(gitCwd);
  }, [gitCwd]);

  const persistSession = sessionPersistence.persist;

  useEffect(() => {
    let timer: number | undefined;
    const observe = () => {
      if (
        !sessionPersistence.observe(
          sessionState.snapshot(),
          openSessionIds(tabsRef.current),
        )
      )
        return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(
        () => void sessionPersistence.writePending(),
        650,
      );
    };
    observe();
    const unsubscribe = sessionState.observe(observe);
    return () => {
      unsubscribe();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const refs = inFlightRefs(sessions, tabs);
    if (refs.length > 0) sawInFlight.current = true;
    const key = inFlightSnapshotKey(refs);
    if (
      !shouldWriteInFlightSnapshot(
        key,
        refs,
        inFlightSyncKey.current,
        sawInFlight.current,
      )
    ) {
      return;
    }
    inFlightSyncKey.current = key;
    void replaceInFlightSessions(refs).catch(() => undefined);
  }, [sessions, tabs]);

  useEffect(() => {
    if (windowTransfer) return;
    const snapshot = collectWorkspaceSnapshot(
      tabs,
      sessions,
      activeTabId,
      projectCwd,
      reconcileProjectReturn({
        memory: projectReturnRef.current,
        tabs,
        sessions,
        activeTabId,
      }),
      projectTerminals,
      lastDockSide ?? undefined,
      keepWorkspaceTab,
    );
    const key = workspaceSnapshotKey(snapshot);
    if (workspaceSyncKey.current === key) return;
    workspaceSyncKey.current = key;
    const timer = window.setTimeout(() => {
      void saveWorkspaceSnapshot(snapshot).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    tabs,
    sessions,
    activeTabId,
    projectCwd,
    projectTerminals,
    lastDockSide,
    windowTransfer,
    keepWorkspaceTab,
    projectWorktree?.path,
    workspaceNavigation.revision,
  ]);

  useEffect(() => {
    if (lastProjectPath()) return;
    void invoke<string>("default_cwd")
      .then((cwd) => {
        if (!looksLikeProject(cwd)) return;
        setProjectCwd(cwd);
        setRecents((prev) => (prev.length > 0 ? prev : rememberProject(cwd)));
        setSessions((prev) =>
          prev.map((s) => (s.cwd === "~" ? { ...s, cwd } : s)),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        const isolated = isolateTerminalPanes(tab);
        if (isolated !== tab) changed = true;
        return isolated;
      });
      return changed ? next : prev;
    });
  }, [tabs]);

  // Tabs are views. Hidden idle sessions drop their child. A visible session
  // keeps its child for a few minutes after a turn so follow-ups stay instant,
  // then parks it and resumes on the next prompt.
  useIdleSessionDetach({
    sessions,
    sessionsRef,
    tabs,
    tabsRef,
    orchestrationRuns,
    liveAgentsEnabled,
    unseenFinishedIds,
    openingSessionIds,
    loadedSessionCache,
    skipForgetSessionIds,
    persistSession,
    setSessions,
  });

  const setActiveTabIdRef = useRef(setActiveTabId);
  setActiveTabIdRef.current = setActiveTabId;
  const tabFocusDeps = useStableFlow(
    (): TabFocusDeps => ({
      store: workspaceStore,
      tabs: () => tabsRef.current,
      sessions: () => sessionsRef.current,
      activeTabId: () => activeTabIdRef.current,
      projectCwd: () => projectCwdRef.current,
      selectTab: (tabId, reason) => {
        if (reason === "workspace") setActiveTabIdState(tabId);
        else setActiveTabIdRef.current(tabId);
      },
      setComposerFocused: (focused) => setComposerFocused(focused),
      cache: loadedSessionCache.current,
      persistence: sessionPersistence,
      forgetHarness: (session) =>
        void forgetHarnessSession(session.harness, session.id),
      leaveCoveringViews: () => closeFamiliarView(),
    }),
  );
  const activateTab = useCallback(
    (tabId: string, paneId?: string, reason?: TabSelectReason) =>
      activateWorkspaceTab(tabFocusDeps, tabId, paneId, reason),
    [],
  );

  useEffect(() => {
    tabVisits.sync(new Set(tabs.map((tab) => tab.id)), activeTabId);
  }, [activeTabId, tabs]);

  /** `cwd` scopes group inheritance: a tab from another project starts alone. */
  const tabLayoutDeps = useStableFlow(
    (): TabLayoutDeps => ({
      store: workspaceStore,
      activeTabId: () => activeTabIdRef.current,
      projectOfTab,
    }),
  );
  const insertBeside = useCallback(
    (
      prev: WorkspaceTab[],
      tab: WorkspaceTab,
      anchorId: string | undefined,
      cwd?: string,
    ) => insertTabBeside(tabLayoutDeps, prev, tab, anchorId, cwd),
    [],
  );
  const insertBesideActive = useCallback(
    (prev: WorkspaceTab[], tab: WorkspaceTab, cwd?: string) =>
      insertTabBesideActiveTab(tabLayoutDeps, prev, tab, cwd),
    [],
  );
  const appendTab = useCallback(
    (tab: WorkspaceTab, cwd?: string) => appendWorkspaceTab(tabLayoutDeps, tab, cwd),
    [],
  );
  const openSessionTab = useCallback(
    (session: Session, cwd: string) =>
      openWorkspaceSessionTab(tabLayoutDeps, session, cwd),
    [],
  );

  const usageLimitAccountChangeRef = useRef<
    ((sessionId: string, accountId: string) => Promise<void>) | null
  >(null);
  const providerAccountDeps = useStableFlow(
    (): ProviderAccountDeps => ({
      sessions: () => sessionsRef.current,
      updateSessions: (update) =>
        updateSessionState(sessionsRef, setSessions, update),
      continueLimited: (sessionId, accountId) =>
        void usageLimitAccountChangeRef.current?.(sessionId, accountId),
      appendTab,
      setActiveTabId: (tabId) => setActiveTabIdRef.current(tabId),
      setComposerFocused,
    }),
  );
  const onSelectProviderAccount = useCallback(
    (provider: ProviderAccountProvider, accountId: string) =>
      selectProviderAccount(providerAccountDeps, active?.id, provider, accountId),
    [active?.id],
  );

  const onOpenWhatsNew = useCallback((version: string) => {
    const document = releaseNotesForVersion(version);
    if (!document) {
      void alertApp(
        "Release notes for this version are not available in this build.",
      );
      return;
    }
    setWhatsNewVersion(document.source.version);
  }, []);

  const createWorkspaceTab = useCallback(
    (cwd: string, focus?: WorktreeFocus) => {
      const session = {
        ...newDefaultSession(cwd, sessionDefaults?.runtimeMode),
        ...(focus && !sameProjectPath(focus.path, cwd)
          ? { worktreeCwd: focus.path, branch: focus.branch ?? undefined }
          : {}),
      };
      return openSessionTab(session, cwd).id;
    },
    [openSessionTab, sessionDefaults?.runtimeMode],
  );

  const onNew = useCallback(() => {
    setSearchViewOpen(false);
    setInboxViewOpen(false);
    setNotesViewOpen(false);
    setAutomationsViewOpen(false);
    const cwd = sidebarCwd;
    const session = newWorkspaceSession(cwd, sessionDefaults?.runtimeMode);
    const tab = openSessionTab(session, cwd);
    setActiveTabId(tab.id);
    setComposerFocused(true);
    return session.id;
  }, [openSessionTab, sessionDefaults?.runtimeMode, sidebarCwd]);

  const onSelectRemoteSession = useCallback(
    (project: string, remoteSessionId: string) => {
      setSearchViewOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsViewOpen(false);
      const existing = findRemoteSessionTab(
        tabsRef.current,
        sessionsRef.current,
        project,
        remoteSessionId,
      );
      if (existing) {
        activateTab(existing.tab.id, existing.shellId);
        return;
      }
      // Reserve a dedicated tab immediately. An apparently blank remote tab
      // may hold composer text or a create/upload that the host has not accepted.
      const session = newDefaultSession(project, sessionDefaults?.runtimeMode);
      rememberRemoteSession(session.id, remoteSessionId);
      const tab = openSessionTab(session, project);
      setActiveTabId(tab.id);
    },
    [activateTab, openSessionTab, sessionDefaults?.runtimeMode],
  );

  const onStartInboxItem = useCallback(
    (item: InboxItem, body?: string) => startInboxItem(inboxDeps, item, body),
    [],
  );
  const onAddNoteToChat = useCallback(
    (card: NoteComposerCard) => addNoteToChat(inboxDeps, card),
    [],
  );
  useAddNoteToChat(onAddNoteToChat);

  const onInboxCardDismiss = useCallback(
    (sessionId: string) => dismissComposerCard(setSessions, sessionId, "inboxCard"),
    [],
  );
  const setLinkedWorkItemUpdateCard = linkedUpdateCards.update;
  const onLinkedWorkItemUpdateCardDismiss = linkedUpdateCards.dismiss;
  const onNoteCardDismiss = useCallback(
    (sessionId: string) => dismissComposerCard(setSessions, sessionId, "noteCard"),
    [],
  );
  const onHandoffCardDismiss = useCallback(
    (sessionId: string) => dismissComposerCard(setSessions, sessionId, "handoffCard"),
    [],
  );

  const onSplit = useCallback(
    (dir: SplitDir) => {
      closeFamiliarView();
      if (!activeTab) return;
      const session = newDefaultSession(
        sessionDefaults?.cwd ?? projectCwd,
        sessionDefaults?.runtimeMode,
      );
      splitFocusedPane(workspaceStore, activeTab.id, dir, session);
      setComposerFocused(true);
    },
    [
      activeTab,
      projectCwd,
      sessionDefaults?.cwd,
      sessionDefaults?.runtimeMode,
    ],
  );

  const terminalDeps = useStableFlow(
    (): TerminalDeps => ({
      store: workspaceStore,
      projectCwd: () => projectCwdRef.current,
      sidebarCwd: () => sidebarCwdRef.current,
      terminalCwd: () => terminalCwdRef.current,
      docks: () => projectTerminalsRef.current,
      lastDockSide: () => lastDockSideRef.current,
      tabs: () => tabsRef.current,
      sessions: () => sessionsRef.current,
      activeTabId: () => activeTabIdRef.current,
      setComposerFocused: (focused) => setComposerFocused(focused),
      selectTab: (tabId) => setActiveTabId(tabId),
      appendTab: (tab, cwd) => appendTab(tab, cwd),
      leaveCoveringFamiliar: () => leaveCoveringFamiliar(),
      dropBlankSession: (session) => {
        sessionPersistence.forgetSaved(session.id);
        void forgetHarnessSession(session.harness, session.id);
        setSessions((prev) => prev.filter((entry) => entry.id !== session.id));
      },
      confirmCloseTerminal,
      confirmCloseTerminals,
    }),
  );
  const focusProjectTerminal = useCallback(
    () => focusDockTerminal(terminalDeps),
    [],
  );
  const onOpenTerminal = useCallback(
    (cwd: string, asWorkspaceTab = false, occupySessionId?: string) =>
      openTerminal(terminalDeps, cwd, asWorkspaceTab, occupySessionId),
    [],
  );
  const onNewTerminal = useCallback(() => openTerminal(terminalDeps, ""), []);
  const onNewTerminalTab = useCallback(
    () => openTerminal(terminalDeps, "", true),
    [],
  );
  const onNewTerminalInSession = useCallback(
    (sessionId: string) => openTerminalInSession(terminalDeps, sessionId),
    [],
  );
  const onToggleProjectTerminal = useCallback(
    () => toggleProjectTerminal(terminalDeps),
    [],
  );
  const onHideProjectTerminal = useCallback(
    () => hideProjectTerminal(terminalDeps),
    [],
  );
  const onProjectTerminalSide = useCallback(
    (side: DockSide) => setProjectTerminalSide(terminalDeps, side),
    [],
  );
  const onProjectTerminalSize = useCallback(
    (size: number) => setProjectTerminalSize(terminalDeps, size),
    [],
  );
  const onSelectProjectTerminal = useCallback(
    (fileId: string) => selectProjectTerminal(terminalDeps, fileId),
    [],
  );
  const onReorderProjectTerminals = useCallback(
    (ids: string[]) => reorderProjectTerminals(terminalDeps, ids),
    [],
  );
  const onCloseProjectTerminal = useCallback(
    (fileId: string) => closeProjectTerminal(terminalDeps, fileId),
    [],
  );
  const onCloseOtherProjectTerminals = useCallback(
    (fileId: string) => closeOtherProjectTerminals(terminalDeps, fileId),
    [],
  );
  const onTerminalMetaChange = useCallback(
    (fileId: string, patch: TerminalMetaPatch) =>
      changeTerminalMeta(terminalDeps, fileId, patch),
    [],
  );
  const onToggleRunningTerminal = useCallback(
    (fileId: string) => toggleRunningTerminal(terminalDeps, fileId),
    [],
  );
  const focusedDockTerminal = useCallback(
    () => focusedDockTerminalOf(terminalDeps),
    [],
  );

  const tabCloseDeps = useStableFlow(
    (): TabCloseDeps => ({
      store: workspaceStore,
      tabs: () => tabsRef.current,
      sessions: () => sessionsRef.current,
      activeTabId: () => activeTabIdRef.current,
      projectCwd: () => projectCwdRef.current,
      dirtyFiles: () => dirtyFilesRef.current,
      setSessions: (update) => setSessions(update),
      setComposerFocused: (focused) => setComposerFocused(focused),
      insetLayout: () => insetLayoutRef.current,
      navigation: () => displayedTabNavigation.current,
      tabWorkspace: (tab, list) => tabWorkspace(tab, list),
      activateTab: (tabId) => activateTab(tabId),
      persist: (session) => persistSession(session),
      refreshHistory: () => void refreshHistory(sidebarCwdRef.current),
      closeFamiliarView: () => closeFamiliarView(),
      confirmDiscardUnsaved,
      confirmCloseTerminal,
      confirmCloseTerminals,
    }),
  );
  const onCloseTab = useCallback(
    (id: string, opts?: { confirmedTerminalIds?: string[] }) =>
      closeTab(tabCloseDeps, id, opts),
    [],
  );
  const onCloseTabs = useCallback(
    (ids: string[], fallbackId: string, opts?: { confirmed?: boolean }) =>
      closeTabs(tabCloseDeps, ids, fallbackId, opts),
    [],
  );
  const onCloseOtherTabs = useCallback(() => closeOtherTabs(tabCloseDeps), []);
  const onCloseFile = useCallback(
    (paneId: string, fileId: string) => closeFile(tabCloseDeps, paneId, fileId),
    [],
  );
  const onCloseOtherFiles = useCallback(
    (paneId: string, fileId: string) =>
      closeOtherFiles(tabCloseDeps, paneId, fileId),
    [],
  );
  const onRemoteSessionDeleted = useCallback(
    (remoteSessionId: string) =>
      closeDeletedRemoteSession(tabCloseDeps, remoteSessionId),
    [],
  );
  const onCloseEveryTab = useCallback(
    (scope?: readonly string[]) => closeEveryTab(tabCloseDeps, scope),
    [],
  );
  const onCloseAllTabs = useCallback(() => closeAllTabs(tabCloseDeps), []);
  const onClosePane = useCallback(
    (sessionId?: string) => closePane(tabCloseDeps, sessionId),
    [],
  );
  const onCloseTitleTab = useCallback(
    (id: string) => closeTitleTab(tabCloseDeps, id),
    [],
  );

  /** ⌘T / Ctrl+T: add a dock terminal while the dock has focus, else a tab. */
  const onNewFocused = useCallback(() => {
    if (focusedDockTerminal()) onNewTerminal();
    else onNew();
  }, [focusedDockTerminal, onNew, onNewTerminal]);

  /** ⌘W / Ctrl+W: close the focused dock terminal, else the focused pane. */
  const onCloseFocused = useCallback(() => {
    const fileId = focusedDockTerminal();
    if (fileId) onCloseProjectTerminal(fileId);
    else onClosePane();
  }, [focusedDockTerminal, onCloseProjectTerminal, onClosePane]);

  /** Open tabs per workspace in the sidebar's project, keyed by worktree
   * path, so the switcher can show what each worktree still has open. */
  const worktreeTabStats = useMemo(() => {
    const stats = new Map<string, { tabs: number; busy: boolean }>();
    if (!sidebarCwd || sidebarCwd === "~" || isRemoteProjectPath(sidebarCwd))
      return stats;
    for (const tab of filterTabsForProject(tabs, sessions, sidebarCwd)) {
      const workspace = tabWorkspace(tab, sessions) ?? sidebarCwd;
      const key = pathKey(workspace);
      const entry = stats.get(key) ?? { tabs: 0, busy: false };
      entry.tabs += 1;
      entry.busy ||= leafIds(tab.layout).some(
        (id) => sessions.find((session) => session.id === id)?.busy,
      );
      stats.set(key, entry);
    }
    return stats;
  }, [tabs, sessions, sidebarCwd, tabWorkspace, workspaceNavigation.revision]);
  const deckProjectTabs = useMemo(() => {
    // A projectless session belongs to no project, so it stands on its own
    // rather than trailing the last project's tabs.
    const active = tabs.find((tab) => tab.id === activeTabId);
    if (active && !workspaceTabCwd(active, sessions)) return [active];
    // Each worktree keeps its own tabs; the others stay open, just hidden.
    const worktree = projectWorktree?.path ?? projectCwd;
    return filterTabsForProject(tabs, sessions, projectCwd).filter((tab) => {
      if (tab.id === activeTabId) return true;
      const workspace = tabWorkspace(tab, sessions);
      return !workspace || sameProjectPath(workspace, worktree);
    });
  }, [
    activeTabId,
    tabs,
    sessions,
    projectCwd,
    projectWorktree?.path,
    tabWorkspace,
    workspaceNavigation.revision,
  ]);

  const onNext = useCallback(() => {
    if (workspaceStore.getState().familiarViewId) {
      activateTab(activeTabId);
      return;
    }
    const tab = cycleTab(deckProjectTabs, activeTabId, 1);
    if (tab) activateTab(tab.id);
  }, [activateTab, activeTabId, deckProjectTabs]);

  const onPrev = useCallback(() => {
    if (workspaceStore.getState().familiarViewId) {
      activateTab(activeTabId);
      return;
    }
    const tab = cycleTab(deckProjectTabs, activeTabId, -1);
    if (tab) activateTab(tab.id);
  }, [activateTab, activeTabId, deckProjectTabs]);

  const visitTab = useCallback(
    (direction: "back" | "forward") => {
      // A Familiar's full view covers the tabs; visiting returns to them first.
      if (workspaceStore.getState().familiarViewId) {
        activateTab(activeTabIdRef.current);
        return;
      }
      const openTabIds = new Set(tabsRef.current.map((tab) => tab.id));
      const tabId = tabVisits.step(
        direction,
        openTabIds,
        activeTabIdRef.current,
      );
      if (tabId) activateTab(tabId);
    },
    [activateTab],
  );
  const onVisitBack = useCallback(() => visitTab("back"), [visitTab]);
  const onVisitForward = useCallback(() => visitTab("forward"), [visitTab]);

  const onActivate = useCallback(
    (slot: number) => {
      const tab = tabInSlot(deckProjectTabs, slot);
      if (tab) activateTab(tab.id);
    },
    [activateTab, deckProjectTabs],
  );

  const paneDeps = useStableFlow(
    (): PaneDeps => ({
      store: workspaceStore,
      tabsRef,
      activeTabIdRef,
      sessionsRef,
      setComposerFocused: (focused) => setComposerFocused(focused),
      closeFamiliarView: () => closeFamiliarView(),
      closeAutomations: () => setAutomationsViewOpen(false),
      cancelNavigation: () => workspaceNavigation.cancel(),
      activateTab: (tabId, paneId) => activateTab(tabId, paneId),
      selectTab: (tabId) => setActiveTabId(tabId),
      appendTab: (tab, cwd) => appendTab(tab, cwd),
      ensureOpenSession: (sessionId) => ensureOpenSession(sessionId),
      openFamiliar: (familiarId) => onOpenFamiliar(familiarId),
      focusOpenSession: (sessionId) => focusOpenSession(sessionId),
      replaceBlankPane: (session) => replaceBlankPaneWithSession(session),
      linkedUpdates: () => linkedSessionUpdatesRef.current,
      revealLinkedUpdate: (sessionId, update) =>
        revealLinkedSessionUpdate(sessionId, update),
    }),
  );
  // These depend on render state; stable flows reach the current ones here.
  const renderedTabActions = useRef({
    onNext,
    onPrev,
    onActivate,
    onCloseFocused,
    onSelectRemoteSession,
  });
  renderedTabActions.current = {
    onNext,
    onPrev,
    onActivate,
    onCloseFocused,
    onSelectRemoteSession,
  };
  const sessionListDeps = useStableFlow(
    (): SessionListDeps => ({
      ...paneDeps,
      navigationIds: sessionNavigationIdsRef,
      selectHistorySession: (sessionId) => onSelectHistorySession(sessionId),
      selectRemoteSession: (project, remoteSessionId) =>
        renderedTabActions.current.onSelectRemoteSession(project, remoteSessionId),
      prefetch: (sessionId) => onPrefetchHistorySession(sessionId),
    }),
  );
  const onFocusPane = useCallback(
    (paneId: string) => focusPane(paneDeps, paneId),
    [],
  );

  const onOpenDiff = useCallback(
    (
      path?: string,
      session?: { sessionId: string; cwd: string },
      changeKind?: GitFileDiffKind,
      pin = false,
      options?: { exact?: boolean },
    ) => {
      void openDiff(openDiffDeps, path, { session, changeKind, pin, exact: options?.exact });
    },
    [],
  );

  // A Familiar view covers the workspace, so its session changes open on the
  // overview's Changes tab instead of in a project tab hidden behind it.
  const openMonoChanges = useCallback((request: MonoChangesRequest) => {
    setFamiliarShownSession(null);
    setFamiliarOverviewDocument(null);
    setFamiliarChangesRequest(request);
    setFamiliarOverviewTab("changes");
    setFamiliarOverviewOpen(true);
  }, []);
  const onOpenMonoDiff = useCallback(
    (path?: string, session?: { sessionId: string; cwd: string }) => {
      if (!session) {
        onOpenDiff(path);
        return;
      }
      openMonoChanges({ path });
    },
    [onOpenDiff, openMonoChanges],
  );
  const onCommitMonoChanges = useCallback(
    () => openMonoChanges({}),
    [openMonoChanges],
  );

  const onOpenWorkingTreeDiff = useCallback(
    (path: string, kind?: GitFileDiffKind, pin?: boolean) =>
      onOpenDiff(path, undefined, kind, pin, { exact: true }),
    [onOpenDiff],
  );

  /** Stack one section's working-tree changes in one review, whatever the diff-view setting. */
  const onOpenAllChanges = useCallback(
    (kind: GitFileDiffKind) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId
            ? openChangesTab(
                tab,
                gitCwdRef.current,
                undefined,
                kind,
                sidebarCwdRef.current,
              )
            : tab,
        ),
      );
      setComposerFocused(false);
    },
    [activeTabId],
  );

  const onOpenCommit = useCallback(
    (commit: GitHistoryCommit, pin?: boolean) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTabId
            ? openCommitTab(
                tab,
                gitCwdRef.current,
                {
                  sha: commit.sha,
                  shortSha: commit.shortSha,
                  subject: commit.subject,
                },
                sidebarCwdRef.current,
                pin,
              )
            : tab,
        ),
      );
      setComposerFocused(false);
    },
    [activeTabId],
  );

  const onShowSourceControl = useCallback(() => {
    setSidebarTab("changes");
  }, []);

  const onToggleChanges = useCallback(() => {
    onShowSourceControl();
  }, [onShowSourceControl]);

  const onReorderTabs = useCallback(
    (ids: string[], movedId?: string) =>
      reorderWorkspaceTabs(tabLayoutDeps, ids, movedId),
    [],
  );

  const onReorderFiles = useCallback(
    (paneId: string, ids: string[]) =>
      reorderPaneFiles(workspaceStore, paneId, ids),
    [],
  );

  const onMovePane = useCallback(
    (fromId: string, toId: string, edge: PaneEdge) =>
      movePaneTo(workspaceStore, fromId, toId, edge),
    [],
  );

  const onDetachPane = useCallback(
    (paneId: string, targetTabId: string, position: "before" | "after") =>
      detachPane(paneDeps, paneId, targetTabId, position),
    [],
  );

  const focusOpenSession = useCallback(
    (sessionId: string) => focusTabOfSession(tabFocusDeps, sessionId),
    [],
  );

  const replaceBlankPaneWithSession = useCallback(
    (session: Session) => replaceBlankPane(tabFocusDeps, session),
    [],
  );

  const invalidateLoadedSession = sessionLoader.invalidate;

  const openSavedSessionDeps = useStableFlow(
    (): OpenSavedSessionDeps => ({
      openSessions: () => sessionsRef.current,
      commitSessions: (next) => {
        sessionsRef.current = next;
        setSessions(next);
      },
      loader: sessionLoader,
      repair: (restored) => repairSession(restored, { persist: false }),
      updateSessions: (update) => updateSessionState(sessionsRef, setSessions, update),
      opening: openingSessionIds.current,
      cache: loadedSessionCache.current,
      isRemoving: (sessionId) => removingSessionIds.current.has(sessionId),
      persistence: sessionPersistence,
      refreshHistory: () => void refreshHistory(sidebarCwdRef.current),
      bindProvider: (restored) => {
        if (
          restored.worktreeRemoved ||
          !restored.providerSessionId ||
          !isLiveHarness(restored.harness)
        )
          return;
        bindHarnessSession(
          restored.harness,
          restored.id,
          restored.providerSessionId,
          sessionWorkCwd(restored),
          restored.providerAccountId,
          restored.blocks,
        );
      },
    }),
  );
  const ensureOpenSession = useCallback(
    (sessionId: string) => openSavedSession(openSavedSessionDeps, sessionId),
    [],
  );

  const onPrefetchHistorySession = sessionLoader.prefetch;

  const revealLinkedSessionUpdate = linkedUpdateCards.reveal;
  const inboxAsk = useStableFlow(() =>
    createInboxAsk({
      store: workspaceStore,
      sessionsRef,
      setSessions,
      sidebarCwd: () => sidebarCwdRef.current,
      removingSessionIds,
      stopSessionForRemoval: (sessionId) => stopSessionForRemoval(sessionId),
    }),
  );
  const onAskInboxItem = inboxAsk.ask;
  const onRestartInboxAsk = inboxAsk.restart;

  useEffect(() => {
    if (!inboxAskPortal || !inboxViewOpen) return;
    setComposerFocused(true);
  }, [inboxAskPortal, inboxViewOpen]);

  const onOpenFamiliar = familiarView.open;

  // A Familiar open when the app last closed opens again; a moved window keeps
  // what it carried.
  const reopenedFamiliar = useRef(false);
  useEffect(() => {
    if (reopenedFamiliar.current) return;
    reopenedFamiliar.current = true;
    if (windowTransfer || !familiarsEnabled) return;
    const familiarId = loadOpenFamiliar();
    if (familiarId && findFamiliar(familiarId)) void onOpenFamiliar(familiarId);
    else if (familiarId) saveOpenFamiliar(undefined);
  }, [familiarsEnabled, onOpenFamiliar, windowTransfer]);

  const onToggleFamiliar = useCallback(
    () => familiarView.toggle(familiarsEnabled),
    [familiarsEnabled],
  );

  /** A new Familiar opens straight away, ready to be told what it works on. */
  const onCreateFamiliar = useCallback((projects?: readonly string[]) => {
    const familiarId = createFamiliar(projects).id;
    setFamiliarSettingsFor(familiarId);
    void onOpenFamiliar(familiarId);
  }, [onOpenFamiliar]);

  const onSelectHistorySession = useCallback(
    (sessionId: string) => selectHistorySession(paneDeps, sessionId),
    [],
  );

  const onOpenMonoLaunchedSession = useCallback(
    async (sessionId: string) => {
      const session = await ensureOpenSession(sessionId);
      if (!session) throw new Error("This session is no longer available.");
      closeFamiliarView();
      setSidebarTab("sessions", session.cwd);
      await onSelectHistorySession(sessionId);
    },
    [ensureOpenSession, closeFamiliarView, setSidebarTab, onSelectHistorySession],
  );

  const onOpenFamiliarSession = useCallback(
    (
      familiarSessionId: string,
      _turnId: string,
      _blocks: Block[],
      launchedId: string,
    ) => familiarView.showLaunchedSession(familiarSessionId, launchedId),
    [],
  );

  const openReminderSession = useCallback(
    async (sessionId: string) => {
      const session = await ensureOpenSession(sessionId);
      if (!session)
        throw new Error("This conversation is no longer available.");
      setSearchViewOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsViewOpen(false);
      setSettingsOpen(false);
      setFilePickerOpen(false);
      setSidebarTab("sessions", session.cwd);
      setProjectCwd(session.cwd);
      setRecents(rememberProject(session.cwd));
      await onSelectHistorySession(sessionId);
    },
    [ensureOpenSession, onSelectHistorySession],
  );

  const ensureReminderSessionsSaved = useCallback(
    async (ids: readonly string[]) => {
      for (const id of ids) {
        const session = sessionsRef.current.find(
          (session) => session.id === id,
        );
        if (session && !(await upsertSession(session))) {
          throw new Error(
            "Send a message in this conversation before setting a reminder.",
          );
        }
      }
    },
    [],
  );

  const sessionReminders = useSessionReminders(
    openReminderSession,
    ensureReminderSessionsSaved,
    sessions
      .filter((session) => !session.inboxAsk)
      .map((session) => session.id),
  );

  const dismissNoticesForContinuedSession = useCallback(
    (sessionId: string) => {
      void sessionReminders.dismissDue(sessionId);
      const updatedAt = sessionsRef.current.find(
        (session) => session.id === sessionId,
      )?.linkedWorkItemUpdateCard?.updatedAt;
      if (updatedAt == null) return;
      markLinkedSessionUpdateSeen(sessionId, updatedAt);
      setLinkedWorkItemUpdateCard(sessionId, (card) =>
        card?.updatedAt === updatedAt ? undefined : card,
      );
    },
    [sessionReminders.dismissDue, setLinkedWorkItemUpdateCard],
  );

  const onPlaceSessionOnPane = useCallback(
    (sessionId: string, targetId: string, edge: PaneEdge) =>
      placeSessionOnPane(placeSessionDeps, sessionId, targetId, edge),
    [],
  );

  const onPlaceTabOnPane = useCallback(
    (sourceTabId: string, targetId: string, edge: PaneEdge) => {
      const targetTab = tabsRef.current.find((tab) =>
        leafIds(tab.layout).includes(targetId),
      );
      if (!targetTab || targetTab.id === sourceTabId) return;

      const blankTarget = sessionsRef.current.find(
        (session) => session.id === targetId && isBlankSession(session),
      );
      const result = applyPlaceTabOnPane({
        tabs: tabsRef.current,
        sessions: sessionsRef.current,
        sourceTabId,
        targetId,
        edge,
        replaceTarget: blankTarget != null,
      });
      if (!result) return;

      if (blankTarget) {
        sessionPersistence.forgetSaved(blankTarget.id);
        void forgetHarnessSession(blankTarget.harness, blankTarget.id);
      }
      sessionsRef.current = result.sessions;
      tabsRef.current = result.tabs;
      setSessions(result.sessions);
      setTabs(result.tabs);
      setActiveTabId(result.activeTabId);
      setProjectTerminalFocused(false);
      setComposerFocused(
        result.sessions.some((session) => session.id === result.focusedId),
      );
    },
    [],
  );

  const sessionActionDeps = useStableFlow(
    (): SessionActionsDeps => ({
      store: workspaceStore,
      openSessions: () => sessionsRef.current,
      loader: sessionLoader,
      persistence: sessionPersistence,
      cache: loadedSessionCache.current,
      refreshHistory: () => void refreshHistory(sidebarCwdRef.current),
      getSession,
      upsertSession,
      setSessionPinned,
    }),
  );

  const onRenameHistorySession = useCallback(
    (sessionId: string, displayTitle: string) =>
      renameSession(sessionActionDeps, sessionId, displayTitle),
    [],
  );

  const worktreeDeps = useStableFlow(
    (): WorktreeDeps => ({
      store: workspaceStore,
      sessionsRef,
      setSessions,
      tabsRef,
      setTabs,
      projectTerminals: () => projectTerminalsRef.current,
      projectCwd: () => projectCwdRef.current,
      removingSessionIds,
      switchingWorktrees,
      removingWorktreePaths,
      workspacePins,
      persistence: sessionPersistence,
      invalidateLoadedSession: (sessionId) => invalidateLoadedSession(sessionId),
      stopSessionForRemoval: (sessionId) => stopSessionForRemoval(sessionId),
      appendTab: (tab, cwd) => appendTab(tab, cwd),
      openSessionTab: (session, cwd) => openSessionTab(session, cwd),
      selectTab: (tabId) => setActiveTabId(tabId),
      focusComposer: () => setComposerFocused(true),
      refreshHistory: (cwd) => refreshHistory(cwd),
      projectOfTab: (tabId) => projectOfTab(tabId),
    }),
  );
  const onCheckWorktreeRemoval = useCallback(
    (cwd: string, path: string, force: boolean) =>
      checkRemoval(worktreeDeps, cwd, path, force),
    [],
  );
  const onRemoveWorktree = useCallback(
    (cwd: string, path: string, force: boolean, keepSessions = false) =>
      removeSessionWorktree(worktreeDeps, cwd, path, force, keepSessions),
    [],
  );

  const activateTabRef = useRef(activateTab);
  activateTabRef.current = activateTab;
  const removalChangeDeps = useStableFlow(
    (): SessionRemovalChangeDeps => ({
      store: workspaceStore,
      openSessions: () => sessionsRef.current,
      commitSessions: (next) => {
        sessionsRef.current = next;
        setSessions(next);
      },
      commitTabs: (next) => {
        tabsRef.current = next;
        setTabs(next);
      },
      activeTabId: () => activeTabIdRef.current,
      activateTab: (tabId) => activateTabRef.current(tabId),
      setComposerFocused: (focused) => setComposerFocused(focused),
      loader: sessionLoader,
      persistence: sessionPersistence,
      cache: loadedSessionCache.current,
      refreshHistory: () => void refreshHistory(sidebarCwdRef.current),
    }),
  );

  const removeSessionDeps = useStableFlow(
    (): RemoveSessionDeps => ({
      store: workspaceStore,
      sessionsRef,
      tabsRef,
      activeTabIdRef,
      dirtyFilesRef,
      removingSessionIds,
      switchingWorktrees,
      deleteConfirmationPending,
      persistence: sessionPersistence,
      removalChange: removalChangeDeps,
      invalidateLoadedSession: (sessionId) => invalidateLoadedSession(sessionId),
      sidebarCwd: () => sidebarCwdRef.current,
      stopSessionForRemoval: (sessionId) => stopSessionForRemoval(sessionId),
      removeWorktree: (cwd, path, force) => onRemoveWorktree(cwd, path, force),
    }),
  );
  const onRemoveHistorySession = useCallback(
    (
      sessionId: string,
      mode: "archive" | "delete",
      skipDeleteConfirm = false,
      origin: "ui" | "cli" = "ui",
    ) => removeSession(removeSessionDeps, sessionId, mode, skipDeleteConfirm, origin),
    [],
  );

  const onArchiveHistorySession = useCallback(
    async (sessionId: string, archived: boolean) => {
      if (archived) return onRemoveHistorySession(sessionId, "archive");
      if (removingSessionIds.current.has(sessionId)) return false;
      try {
        await setSessionArchived(sessionId, false);
        setHistory((current) =>
          current.map((entry) =>
            entry.id === sessionId ? { ...entry, archived: false } : entry,
          ),
        );
        return true;
      } catch (error) {
        void alertApp(
          `Could not unarchive this conversation.\n\n${String(error)}`,
          { kind: "error" },
        );
        return false;
      }
    },
    [onRemoveHistorySession],
  );

  const onArchiveFocusedSession = useCallback(
    (event: KeyboardEvent) => {
      archiveFocusedSession(
        event,
        {
          activeTabId: activeTabIdRef.current,
          tabs: tabsRef.current,
          sessions: sessionsRef.current,
          projectTerminalFocused: projectTerminalFocusedRef.current,
          surfaceOpen: Boolean(
            workspaceStore.getState().familiarViewId ||
            searchViewOpenRef.current ||
            inboxViewOpenRef.current ||
            notesViewOpenRef.current ||
            automationsViewOpenRef.current ||
            settingsOpenRef.current ||
            filePickerOpenRef.current ||
            whatsNewVersionRef.current ||
            getUpdatePrompt() ||
            getAppDialog(),
          ),
        },
        (sessionId) => {
          void onArchiveHistorySession(sessionId, true);
        },
      );
    },
    [onArchiveHistorySession],
  );

  const onPinHistorySession = useCallback(
    (sessionId: string, pinned: boolean) =>
      pinSession(sessionActionDeps, sessionId, pinned),
    [],
  );

  const onSetHistorySessionLinkedWorkItem = useCallback(
    (sessionId: string, linkedWorkItem: LinkedWorkItem | undefined) =>
      setHistorySessionLinkedWorkItem(
        {
          store: workspaceStore,
          sessionsRef,
          setSessions,
          sidebarCwd: () => sidebarCwdRef.current,
          forgetLoaded: (id) => {
            invalidateLoadedSession(id);
            loadedSessionCache.current.delete(id);
          },
          refreshHistory,
        },
        sessionId,
        linkedWorkItem,
      ),
    [invalidateLoadedSession, refreshHistory],
  );

  const onArchiveHistorySessions = useCallback(
    async (sessionIds: readonly string[], archived: boolean) => {
      for (const sessionId of sessionIds) {
        if (!(await onArchiveHistorySession(sessionId, archived))) break;
      }
    },
    [onArchiveHistorySession],
  );

  const onPinHistorySessions = useCallback(
    async (sessionIds: readonly string[], pinned: boolean) => {
      await Promise.all(
        sessionIds.map((sessionId) => onPinHistorySession(sessionId, pinned)),
      );
    },
    [onPinHistorySession],
  );

  const onDeleteWorktreeSessions = useCallback(
    async (sessionIds: readonly string[]): Promise<boolean> => {
      for (const sessionId of sessionIds) {
        if (!(await onRemoveHistorySession(sessionId, "delete", true))) {
          return false;
        }
      }
      return true;
    },
    [onRemoveHistorySession],
  );

  const onDeleteHistorySession = useCallback(
    (sessionId: string) => onRemoveHistorySession(sessionId, "delete"),
    [onRemoveHistorySession],
  );

  const familiarRemovalDeps = useStableFlow(
    (): FamiliarRemovalDeps => ({
      store: workspaceStore,
      sessionsRef,
      removingSessionIds,
      persistence: sessionPersistence,
      view: familiarView,
      commitSessions: (next) => {
        sessionsRef.current = next;
        setSessions(next);
      },
      invalidateLoadedSession: (sessionId) => invalidateLoadedSession(sessionId),
      stopSessionForRemoval: (sessionId) => stopSessionForRemoval(sessionId),
      flushCheckpoint: flushSessionCheckpoint,
      deleteStoredSession: (sessionId, imagePaths) =>
        orchestrator.deleteSession(sessionId, () => deleteSession(sessionId, imagePaths)),
      removeSession: (sessionId, mode, skipDeleteConfirm) =>
        onRemoveHistorySession(sessionId, mode, skipDeleteConfirm),
    }),
  );
  const onResetFamiliar = useCallback(
    (sessionId: string) => resetFamiliar(familiarRemovalDeps, sessionId),
    [],
  );
  const onDeleteFamiliar = useCallback(
    (familiarId: string) => deleteFamiliar(familiarRemovalDeps, familiarId),
    [],
  );

  const onDeleteHistorySessions = useCallback(
    async (sessionIds: readonly string[]) => {
      if (sessionIds.length === 0) return;
      const confirmed = await confirmApp(
        `Delete ${sessionIds.length} selected conversations? This can’t be undone.`,
        { okLabel: "Delete" },
      );
      if (!confirmed) return;
      for (const sessionId of sessionIds) {
        if (!(await onRemoveHistorySession(sessionId, "delete", true))) break;
      }
    },
    [onRemoveHistorySession],
  );

  const sessionIdsInTitleTab = useCallback((tabId: string): string[] => {
    const tab = tabsRef.current.find((entry) => entry.id === tabId);
    if (!tab) return [];
    const openSessionIds = new Set(
      sessionsRef.current.map((session) => session.id),
    );
    return leafIds(tab.layout).filter((id) => openSessionIds.has(id));
  }, []);

  const onArchiveTitleTab = useCallback(
    (tabId: string) => {
      const sessionIds = sessionIdsInTitleTab(tabId);
      void onArchiveHistorySessions(sessionIds, true);
    },
    [onArchiveHistorySessions, sessionIdsInTitleTab],
  );

  const onDeleteTitleTab = useCallback(
    (tabId: string) => {
      const sessionIds = sessionIdsInTitleTab(tabId);
      if (sessionIds.length === 1) {
        void onDeleteHistorySession(sessionIds[0]);
      } else if (sessionIds.length > 1) {
        void onDeleteHistorySessions(sessionIds);
      }
    },
    [onDeleteHistorySession, onDeleteHistorySessions, sessionIdsInTitleTab],
  );

  const onFocusDir = useCallback(
    (dir: FocusDir) => {
      if (!activeTab) return;
      const next = neighborLeafId(activeTab.layout, activeTab.focusedId, dir);
      if (next) onFocusPane(next);
    },
    [activeTab, onFocusPane],
  );

  const onCwdChange = useCallback(
    (sessionId: string, cwd: string) =>
      changeSessionProject(worktreeDeps, sessionId, cwd),
    [],
  );
  const onBranchChange = useCallback(
    (sessionId: string) => changeBranch(worktreeDeps, sessionId),
    [],
  );
  const onWorkspaceModeChange = useCallback(
    (sessionId: string, mode: WorkspaceMode, base?: string) =>
      changeWorkspaceMode(worktreeDeps, sessionId, mode, base),
    [],
  );
  const onWorktreeBaseChange = useCallback(
    (sessionId: string, base: string) =>
      changeWorktreeBase(worktreeDeps, sessionId, base),
    [],
  );
  const onWorktreeChange = useCallback(
    (
      sessionId: string,
      tree: Worktree,
      fromComposer = false,
      isCurrent: () => boolean = () => true,
    ) => changeWorktree(worktreeDeps, sessionId, tree, fromComposer, isCurrent),
    [],
  );
  const onComposerWorktreeChange = useCallback(
    (sessionId: string, tree: Worktree) =>
      changeWorktree(worktreeDeps, sessionId, tree, true),
    [],
  );

  const projectDeps = useStableFlow(
    (): ProjectDeps => ({
      store: workspaceStore,
      sessionsRef,
      setSessions,
      tabsRef,
      activeTabIdRef,
      projectCwdRef,
      projectTerminalsRef,
      turnGen,
      loadedSessionCache,
      loadingSessionIds: () => sessionLoader.loadingIds(),
      invalidateLoadedSession: (sessionId) => invalidateLoadedSession(sessionId),
      persistence: sessionPersistence,
      setSidebarTabSelection,
      sidebarCwd: () => sidebarCwdRef.current,
      closeAutomations: () => setAutomationsViewOpen(false),
      closeFamiliarView: () => closeFamiliarView(),
      navigation: {
        cancel: () => workspaceNavigation.cancel(),
        selectProject: (path) => workspaceNavigation.selectProject(path),
        selectWorkspace: (project, focus) =>
          workspaceNavigation.selectWorkspace(project, focus),
      },
      readProjectReturnMemory: () => readProjectReturnMemory(),
      activateTab: (tabId, paneId) => activateTab(tabId, paneId),
      insertBeside: (tabs, tab, besideTabId, cwd) =>
        insertBeside(tabs, tab, besideTabId, cwd),
      changeSessionProject: (sessionId, cwd) => onCwdChange(sessionId, cwd),
      selectTab: (tabId) => setActiveTabId(tabId),
      focusComposer: () => setComposerFocused(true),
      fileMoved: (from, to) => onFileMoved(from, to),
    }),
  );
  const onSelectWorkspace = useCallback(
    (focus?: WorktreeFocus) => selectWorkspace(projectDeps, focus),
    [],
  );
  const onSelectProject = useCallback(
    (path: string) => selectProject(projectDeps, path),
    [],
  );
  const pickProject = useCallback(() => pickProjects(projectDeps), []);
  const onPlaceSessionInFolder = useCallback(
    (sessionId: string, target: SessionFolderTarget) =>
      placeInFolder(sessionsRef.current, sessionId, target),
    [],
  );
  const onRemoveProject = useCallback(
    (path: string, options: { purgeData: boolean }) =>
      removeProject(projectDeps, path, options),
    [],
  );

  const onRestoreProject = useCallback(
    (path: string) => {
      setRecents(rememberProject(path));
      onSelectProject(path);
    },
    [onSelectProject],
  );

  const fileDeps = useStableFlow(
    (): FileDeps => ({
      store: workspaceStore,
      sessionsRef,
      tabsRef,
      activeTabIdRef,
      gitCwd: () => gitCwdRef.current,
      sidebarCwd: () => sidebarCwdRef.current,
      editorNavigationToken,
      closeFamiliarView: () => closeFamiliarView(),
      insertBesideActive: (tabs, tab, cwd) => insertBesideActive(tabs, tab, cwd),
      activateTab: (tabId, paneId) => activateTab(tabId, paneId),
      selectTab: (tabId) => setActiveTabId(tabId),
      setComposerFocused: (focused) => setComposerFocused(focused),
    }),
  );
  const openDiffDeps = useStableFlow(
    (): OpenDiffDeps => ({
      store: workspaceStore,
      sessionsRef,
      activeTabIdRef,
      gitCwd: () => gitCwdRef.current,
      sidebarCwd: () => sidebarCwdRef.current,
      setComposerFocused: (focused) => setComposerFocused(focused),
      setSidebarTab: (tab, project) => setSidebarTab(tab, project),
    }),
  );
  const placeSessionDeps = useStableFlow(
    (): PlaceSessionDeps => ({
      store: workspaceStore,
      sessionsRef,
      tabsRef,
      persistence: sessionPersistence,
      scope: tabCloseScope,
      projectCwd: () => projectCwdRef.current,
      ensureOpenSession: (sessionId) => ensureOpenSession(sessionId),
      setSessions: (next) => setSessions(next),
      selectTab: (tabId) => setActiveTabId(tabId),
      setComposerFocused: (focused) => setComposerFocused(focused),
    }),
  );
  const onFileMoved = useCallback(
    (from: string, to: string) => fileMoved(fileDeps, from, to),
    [],
  );

  const applyProjectLocationChange = useCallback(
    (from: string, to: string) => moveProjectLocation(projectDeps, from, to),
    [],
  );

  const onFileDeleted = useCallback(
    (path: string) => fileDeleted(fileDeps, path),
    [],
  );
  const onOpenFile = useCallback<OpenFileFn>((path, navigation, options) => {
    closeFamiliarView();
    void openFile(fileDeps, path, navigation, options);
  }, []);
  const onOpenPlan = useCallback(
    (sessionId: string, blockId: string) => openPlan(fileDeps, sessionId, blockId),
    [],
  );
  const onPinFile = useCallback((fileId: string) => pinFile(fileDeps, fileId), []);
  const onFileDirtyChange = useCallback(
    (fileId: string, dirty: boolean) => setFileDirty(fileDeps, fileId, dirty),
    [],
  );
  const onFileErrorCountChange = useCallback(
    (fileId: string, count: number) => setFileErrorCount(fileDeps, fileId, count),
    [],
  );
  const onSelectFileSurface = useCallback(
    (paneId: string, fileId: string) => selectFileSurface(fileDeps, paneId, fileId),
    [],
  );

  const composerDeps = useStableFlow(
    (): ComposerDeps => ({
      store: workspaceStore,
      sessionsRef,
      setSessions,
      persistence: sessionPersistence,
      invalidateLoadedSession: (sessionId) => invalidateLoadedSession(sessionId),
    }),
  );
  const onModelChange = useCallback(
    (sessionId: string, harness: HarnessId, model: string) =>
      changeModel(composerDeps, sessionId, harness, model),
    [],
  );
  const onModelSettingsChange = useCallback(
    (sessionId: string, modelSettings: Record<string, string>) =>
      changeModelSettings(composerDeps, sessionId, modelSettings),
    [],
  );
  const onRuntimeModeChange = useCallback(
    (sessionId: string, runtimeMode: RuntimeMode) =>
      changeRuntimeMode(composerDeps, sessionId, runtimeMode),
    [],
  );
  const onSaveDraft = useCallback(
    (
      sessionId: string,
      text: string,
      attachments: Attachment[] = [],
      appRequestId?: string,
    ) => saveDraft(composerDeps, sessionId, text, attachments, appRequestId),
    [],
  );
  const onRemoveDraft = useCallback(
    (sessionId: string, draftBlockId: string) =>
      removeDraft(composerDeps, sessionId, draftBlockId),
    [],
  );

  const submitSession = useCallback(
    (...args: Parameters<Submit>): SubmissionAcceptance =>
      submitToSession(
        {
          sessionsRef,
          setSessions,
          turnGen,
          activeSessionIdRef,
          removingSessionIds,
          switchingWorktrees,
          removingWorktreePaths,
          projectLocationSyncs,
          workspacePins,
          submitAfterProjectSyncRef,
          editedResends,
          workspaceNavigation,
          enqueueHarnessEvent,
          flushHarnessEvents,
          dismissNoticesForContinuedSession,
          applyProjectLocationChange,
        },
        ...args,
      ),
    [
      applyProjectLocationChange,
      dismissNoticesForContinuedSession,
      enqueueHarnessEvent,
      flushHarnessEvents,
    ],
  );
  submitAfterProjectSyncRef.current = submitSession;
  // Interactive callers use the immediate result to clear their composer. The
  // queued-launch receiver uses submitSession to await the actual acceptance.
  const onSubmit = useCallback(
    (...args: Parameters<Submit>): boolean => {
      // Reject before async preparation can make the composer clear its draft.
      if (workspaceNavigation.isSwitching(args[0])) return false;
      const result = submitSession(...args);
      if (typeof result === "boolean") return result;
      // Deferred errors have already been displayed by submitAfterProjectSync.
      void result.catch(() => undefined);
      return true;
    },
    [submitSession],
  );

  const familiarChat = useStableFlow(() =>
    createFamiliarChat({
      openSessions: () => sessionsRef.current,
      commitSessions: (next) => {
        sessionsRef.current = next;
        setSessions(next);
      },
      persist: (session) => sessionPersistence.persist(session),
      schedule: (run, ms) => window.setTimeout(run, ms),
    }),
  );

  const familiarHabitHost = useStableFlow(() =>
    createFamiliarHabitHost({
      sessionsRef,
      activeSessionIdRef,
      chat: familiarChat,
      commitSessions: (next) => {
        sessionsRef.current = next;
        setSessions(next);
      },
      ensureOpenSession: (sessionId) => ensureOpenSession(sessionId),
      submitSession: (...args) => submitSessionRef.current(...args),
      stopSessionForRemoval: (sessionId) => stopSessionForRemoval(sessionId),
      noteReply: familiarReplies.noteReply,
    }),
  );
  useFamiliarHabits(familiarHabitHost);

  const automationDeps = useStableFlow(
    (): AutomationDeps => ({
      store: workspaceStore,
      sessionsRef,
      setSessions,
      tabsRef,
      appendTab: (tab, cwd) => appendTab(tab, cwd),
      selectTab: (tabId) => setActiveTabId(tabId),
      setComposerFocused: (focused) => setComposerFocused(focused),
      focusOpenSession: (sessionId) => focusOpenSession(sessionId),
      setSidebarTab: (tab, project) => setSidebarTab(tab, project),
      closeAutomations: () => setAutomationsViewOpen(false),
      submitSession: (...args) => submitSessionRef.current(...args),
      saveDraft: (...args) => onSaveDraft(...args),
    }),
  );
  const automationRuns = useStableFlow(() => createAutomationRuns(automationDeps));
  const launchAutomation = automationRuns.launch;

  const familiarCompletions = useStableFlow(() =>
    createFamiliarCompletions({
      ensureOpenSession: (sessionId) => ensureOpenSession(sessionId),
      isRemoving: (sessionId) => removingSessionIds.current.has(sessionId),
      setSessions,
      isBusyOnTurn: (familiarId, turn) => {
        const familiar = sessionsRef.current.find((session) => session.id === familiarId);
        return !!familiar?.busy && turnGen.current.get(familiarId) === turn;
      },
    }),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: every session change may end a Familiar's turn.
  useEffect(() => {
    familiarCompletions.closeInactive();
  }, [sessions]);

  const launchQuickSession = useCallback(
    (
      launch: QuickLaunch,
      deliveryId: string,
      placement?: AppSessionPlacement,
      onSettled?: (outcome: ControlOutcome) => void,
      openTab?: boolean,
    ) =>
      launchQuickSessionInWorkspace(
        automationDeps,
        launch,
        deliveryId,
        placement,
        onSettled,
        openTab,
      ),
    [],
  );
  useQuickComposerLaunches(launchQuickSession);
  const launchQuickSessionRef = useRef(launchQuickSession);
  launchQuickSessionRef.current = launchQuickSession;
  const { taskBoard, isMainWindow, railBadges } = useWorkspaceTaskBoard({
    launch: (launch, id, onSettled) =>
      launchQuickSessionRef.current(launch, id, undefined, onSettled, false),
    sessions: () => sessionsRef.current,
    loadSession: getSession,
    stop: async (id) => {
      await flushSync(() => stopSessionRef.current(id));
      flushHarnessEvents();
    },
  });
  const taskBoardRef = useRef(taskBoard);
  taskBoardRef.current = taskBoard;
  const submitSessionRef = useRef(submitSession);
  submitSessionRef.current = submitSession;

  useAutomationSchedule(automationRuns);
  const onInboxAppeared = automationRuns.inboxAppeared;

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const turnQueue = useStableFlow(
    (): TurnQueueDeps => ({
      sessions: () => sessionsRef.current,
      updateSessions: (update) => setSessions(update),
      updateSessionsNow: (update) => {
        updateSessionState(sessionsRef, setSessions, update);
      },
      submit: (...args) => onSubmitRef.current(...args),
      enqueueHarnessEvent,
      flushHarnessEvents,
    }),
  );

  const onUpdatePlan = useCallback(
    (sessionId: string, blockId: string, text: string) =>
      updatePlan(turnQueue, sessionId, blockId, text),
    [],
  );
  const onBuildPlan = useCallback(
    (sessionId: string, blockId: string, target?: PlanBuildTarget) =>
      buildPlan(turnQueue, sessionId, blockId, target),
    [],
  );

  useQueueDispatch(sessions, turnQueue, submitSession);

  const onDeleteQueuedMessage = useCallback(
    (sessionId: string, messageId: string) =>
      removeQueuedMessage(turnQueue, sessionId, messageId),
    [],
  );
  const onQueuedMessageEditingChange = useCallback(
    (sessionId: string, messageId?: string) =>
      setQueuedMessageEditing(turnQueue, sessionId, messageId),
    [],
  );
  const onEditQueuedMessage = useCallback(
    (sessionId: string, messageId: string, text: string) =>
      editQueuedMessage(turnQueue, sessionId, messageId, text),
    [],
  );
  const onSteerQueuedMessage = useCallback(
    (sessionId: string, messageId: string) =>
      steerQueuedMessage(turnQueue, sessionId, messageId),
    [],
  );
  const onResumeQueue = useCallback(
    (sessionId: string) => resumeQueue(turnQueue, sessionId),
    [],
  );

  const usageLimits = useStableFlow(() => createUsageLimits(turnQueue));
  const onUsageLimitDismiss = usageLimits.dismiss;
  const onUsageLimitResumeAtReset = usageLimits.setResumeAtReset;
  const onUsageLimitResume = usageLimits.resume;
  const onUsageLimitAccountChange = usageLimits.changeAccount;
  usageLimitAccountChangeRef.current = onUsageLimitAccountChange;
  useUsageLimitTimers(sessions, turnQueue, onUsageLimitResume);

  const openSessionBeside = useCallback(
    (
      sourceId: string,
      session: Session,
      cwd: string,
      focusComposer = false,
    ) => {
      const nextSessions = [...sessionsRef.current, session];
      sessionsRef.current = nextSessions;
      setSessions(nextSessions);

      const tab = tabsRef.current.find((entry) =>
        leafIds(entry.layout).includes(sourceId),
      );
      if (tab) {
        const nextTabs = tabsRef.current.map((entry) =>
          entry.id === tab.id
            ? {
                ...entry,
                layout: splitPane(entry.layout, sourceId, "right", session.id),
                focusedId: session.id,
                diffFocused: false,
              }
            : entry,
        );
        tabsRef.current = nextTabs;
        setTabs(nextTabs);
        if (tab.id !== activeTabIdRef.current) setActiveTabId(tab.id);
      } else {
        const nextTab = newTab(session.id);
        appendTab(nextTab, cwd);
        setActiveTabId(nextTab.id);
      }

      setProjectTerminalFocused(false);
      setComposerFocused(focusComposer);
    },
    [appendTab],
  );

  const onSecondOpinion = useCallback(
    (sourceId: string, target: ModelTarget, turn: Block[]) => {
      const source = sessionsRef.current.find(
        (session) => session.id === sourceId,
      );
      if (!source || source.worktreeRemoved) return;
      const { harness, model, modelSettings } = target;
      const cwd = sessionWorkCwd(source);
      const from = harnessForTurn(source.blocks, turn, source.harness);
      const request = buildSecondOpinionRequest({
        from,
        to: harness,
        turn,
        cwd,
      });
      const session = {
        ...newSession(harness, source.cwd, model, source.runtimeMode),
        worktreeCwd: source.worktreeCwd,
        branch: source.branch,
        modelSettings: mergeModelSettings(
          resolveModel(harness, model),
          modelSettings,
        ),
        title: formatSessionTitle(harness, SECOND_OPINION_TITLE),
      };
      openSessionBeside(sourceId, session, source.cwd);
      onSubmit(session.id, request.prompt, [], request.options);
    },
    [onSubmit, openSessionBeside],
  );
  const onBtwSubmit = btw.submit;
  const onBtwModelChange = btw.changeModel;
  const onBtwDelete = btw.remove;
  const onBtwStop = btw.stop;
  const onBtwRetry = btw.retry;

  const unseenFinishedRef = useRef(unseenFinishedIds);
  unseenFinishedRef.current = unseenFinishedIds;

  const onHandoff = useCallback(
    (sourceId: string, target: ModelTarget, turn: Block[]) => {
      const source = sessionsRef.current.find(
        (session) => session.id === sourceId,
      );
      if (!source || source.worktreeRemoved) return;
      openSessionBeside(
        sourceId,
        handoffSession(source, target, turn),
        source.cwd,
        true,
      );
    },
    [openSessionBeside],
  );

  useAutoContinue(sessions, turnControl.sessions, onSubmit);

  const onCompactContext = useCallback(
    (sessionId: string) => compactContext(turnControl, sessionId),
    [],
  );
  const onStop = useCallback(
    (sessionId: string, managed = false) =>
      stopTurn(turnControl, sessionId, managed),
    [],
  );

  const closeLiveAgentDeps = useStableFlow(
    (): CloseLiveAgentDeps => ({
      sessions: () => sessionsRef.current,
      tabs: () => tabsRef.current,
      dismiss: (sessionId) => {
        setDismissedLiveAgentIds((prev) => {
          if (prev.has(sessionId)) return prev;
          const next = new Set(prev);
          next.add(sessionId);
          return next;
        });
        unseenFinishedRef.current.delete(sessionId);
      },
      stop: (sessionId) => onStop(sessionId),
      closeTab: (tabId) => onCloseTab(tabId),
      persist: (session) => persistSession(session),
      updateTabs: (update) => setTabs(update),
    }),
  );
  const onCloseLiveAgent = useCallback((sessionId: string) => {
    void closeLiveAgent(closeLiveAgentDeps, sessionId);
  }, []);

  useEscapeStop(
    useStableFlow(() => ({
      store: workspaceStore,
      sessions: () => sessionsRef.current,
      tabs: () => tabsRef.current,
      activeTabId: () => activeTabIdRef.current,
      terminalFocused: () => projectTerminalFocusedRef.current,
      stop: (sessionId: string) => onStop(sessionId),
    })),
  );

  const harnessReplyDeps = useStableFlow(
    (): HarnessReplyDeps => ({
      sessions: () => sessionsRef.current,
      decideFamiliarApproval: (familiarId, blockId, decided) =>
        familiarChat.decide(familiarId, blockId, decided),
    }),
  );
  const onApproval = useCallback(
    (sessionId: string, requestId: number, decision: ApprovalDecision) =>
      answerApproval(harnessReplyDeps, sessionId, requestId, decision),
    [],
  );
  const onQuestionReply = useCallback(
    (sessionId: string, requestId: number, reply: UserQuestionReply) =>
      answerQuestion(harnessReplyDeps, sessionId, requestId, reply),
    [],
  );

  useWorkspaceCompanion({
    taskBoard,
    sessions: () => sessionsRef.current,
    // History spans visited projects; phones need it so Open sessions is not
    // limited to tabs currently mounted in memory.
    sessionHistory: () => history,
    familiars: () => (familiarsEnabled ? listFamiliars() : []),
    unseen: () => unseenFinishedRef.current,
    openFamiliar: async (familiarId) =>
      (await ensureFamiliarSession(familiarId, {
        home: homeDir,
        load: ensureOpenSession,
        create: (path) => newDefaultSession(path, sessionDefaults?.runtimeMode),
        add: (created) => {
          sessionsRef.current = [...sessionsRef.current, created];
          setSessions(sessionsRef.current);
        },
      })) ?? undefined,
    openSession: async (sessionId) =>
      (await ensureOpenSession(sessionId)) ?? undefined,
    submit: (sessionId, text, attachments) =>
      submitSessionRef.current(sessionId, text, attachments),
    stop: (sessionId) => onStop(sessionId),
    setRuntimeMode: onRuntimeModeChange,
    approve: onApproval,
    answer: onQuestionReply,
    launch: (launch, id) => launchQuickSessionRef.current(launch, id),
    defaultRuntimeMode: () => sessionDefaults?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
  });

  const onQuestionInteraction = useCallback(
    (sessionId: string, requestId: number) =>
      keepQuestionOpen(harnessReplyDeps, sessionId, requestId),
    [],
  );

  const onOpenApprovalSession = useCallback(
    (sessionId: string) => {
      const parentId =
        sessionsRef.current.find((session) => session.id === sessionId)
          ?.orchestrationLeadId ?? orchestrator.forSession(sessionId)?.leadId;
      if (parentId && parentId !== sessionId) {
        setInspectedWorkerId(sessionId);
        if (!focusOpenSession(parentId)) void onSelectHistorySession(parentId);
      } else if (!focusOpenSession(sessionId)) {
        void onSelectHistorySession(sessionId);
      }
    },
    [focusOpenSession, onSelectHistorySession],
  );

  useEffect(() => {
    setSessions((prev) => attachOrchestrationWorkers(prev, orchestrationRuns));
  }, [orchestrationRuns]);

  useEffect(() => {
    const next = consolidateOrchestrationTabs(
      tabs,
      activeTabId,
      orchestrationRuns,
    );
    if (next.tabs !== tabs) setTabs(next.tabs);
    if (next.activeTabId !== activeTabId) setActiveTabId(next.activeTabId);
  }, [tabs, activeTabId, orchestrationRuns]);

  useOrchestratorBinding(
    useStableFlow(() => ({
      store: workspaceStore,
      sessionsRef,
      setSessions,
      stop: (sessionId: string, managed: boolean) => onStop(sessionId, managed),
      flushHarnessEvents,
      checkOpenWorktreeFiles: (path: string) =>
        checkOpenWorktreeFiles(worktreeDeps, path),
    })),
    submitSession,
  );

  useEffect(() => {
    orchestrator.sync();
  }, [sessions]);

  const stopSessionRef = useRef(onStop);
  stopSessionRef.current = onStop;
  const removeSessionRef = useRef(onRemoveHistorySession);
  removeSessionRef.current = onRemoveHistorySession;

  const agentAppDeps = useStableFlow(
    (): AgentAppDeps => ({
      sessionsRef,
      setSessions,
      turnGen,
      removingSessionIds,
      switchingWorktrees,
      completions: familiarCompletions.batches,
      board: () => taskBoardRef.current,
      flushHarnessEvents,
      ensureOpenSession: (sessionId) => ensureOpenSession(sessionId),
      submitSession: (...args) => submitSessionRef.current(...args),
      saveDraft: (...args) => onSaveDraft(...args),
      stopSession: (sessionId) => stopSessionRef.current(sessionId),
      removeSession: (...args) => removeSessionRef.current(...args),
      launchQuickSession: (...args) => launchQuickSession(...args),
    }),
  );
  useControlRequests(useStableFlow(() => createControlRequests(agentAppDeps)));

  const confirmingOrchestration = useRef(new Set<string>());
  const queueWorkerPanes = useCallback(
    (workers: OrchestrationWorkerDetail[]) => {
      // Finished workers are not open; load stored transcripts before the
      // tabs appear so the pane does not flash the empty state.
      void prepareOrchestrationWorkerDetails(workers, {
        openLead: async (leadId) => {
          if (!focusOpenSession(leadId)) await onSelectHistorySession(leadId);
        },
        openWorker: ensureOpenSession,
        hasSession: (id) =>
          sessionsRef.current.some((session) => session.id === id),
      })
        .then((request) => {
          if (request?.workers.length) setWorkerDetailRequest(request);
        })
        .catch(console.error);
    },
    [ensureOpenSession, focusOpenSession, onSelectHistorySession],
  );
  const onOpenWorkerDetails = useCallback(
    (worker: OrchestrationWorkerDetail) => {
      setInspectedWorkerId(worker.sessionId);
      queueWorkerPanes([worker]);
    },
    [queueWorkerPanes],
  );
  useEffect(() => {
    if (!workerDetailRequest) return;
    const { leadId, workers } = workerDetailRequest;
    const tab = tabs.find((entry) => leafIds(entry.layout).includes(leadId));
    if (!tab) {
      // Still opening: this runs again on the commit that lands the lead. If
      // the lead never arrived at all, drop the request rather than let it
      // fire against some later tab change.
      if (!sessionsRef.current.some((entry) => entry.id === leadId)) {
        setWorkerDetailRequest(null);
      }
      return;
    }
    setWorkerDetailRequest(null);
    // Every agent of a run shares one pane, the way files do: `openEditorTab`
    // focuses an open tab, adds to the pane already beside the lead, or splits
    // one off when there is none.
    const cwd =
      sessionsRef.current.find((entry) => entry.id === leadId)?.cwd ??
      projectCwdRef.current;
    const files = workers.map((worker) =>
      newAgentTab(worker.title, cwd, {
        sessionId: worker.sessionId,
        leadId,
        harness: worker.harness,
      }),
    );
    setTabs((prev) =>
      prev.map((entry) => {
        if (entry.id !== tab.id) return entry;
        const opened = files.reduce(
          (next, file) => openEditorTab(next, file),
          entry,
        );
        // Leave the first worker focused so View agents lands on the start
        // of the run rather than the last tab added.
        return files[0] ? openEditorTab(opened, files[0]) : opened;
      }),
    );
    setActiveTabId(tab.id);
    setComposerFocused(false);
  }, [tabs, workerDetailRequest]);
  const orchestrationWorkers = useMemo(
    () => ({
      selectedId: inspectedWorkerId,
      inspect: setInspectedWorkerId,
      openDetails: onOpenWorkerDetails,
    }),
    [inspectedWorkerId, onOpenWorkerDetails],
  );
  const proposalActions = useStableFlow(() =>
    createProposalActions({
      sessionsRef,
      confirming: confirmingOrchestration,
      orchestrator,
      setSessions: (next) => setSessions(next),
      saveSession: (session) => upsertSession(session),
      submit: (...args) => onSubmitRef.current(...args),
    }),
  );
  const orchestrationActions = useMemo(
    () => ({
      open: onOpenApprovalSession,
      openAgents: queueWorkerPanes,
      update: proposalActions.update,
      confirm: proposalActions.confirm,
      retry: proposalActions.retry,
    }),
    [onOpenApprovalSession, queueWorkerPanes],
  );

  const onSelectLiveAgent = useCallback(
    (sessionId: string) => {
      setSearchViewOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsViewOpen(false);
      onOpenApprovalSession(sessionId);
    },
    [onOpenApprovalSession],
  );

  const shownViewTabId = settingsOpen
    ? undefined
    : familiarCovers
      ? familiarViewTabId
      : activeAppView
        ? appViewTabId(activeAppView)
        : undefined;
  const nextTitleTabs = titleTabList({
    projectTabs: deckProjectTabs,
    sessions,
    dirtyFiles,
    unseenFinishedIds,
    insetLayout,
    openAppViews,
    notesEnabled,
    familiarTabs: shownFamiliarTabs,
    sidebarCwd,
    order: titleTabOrder,
    shownViewTabId,
  });
  tabProjectsRef.current = new Map(
    nextTitleTabs.map((tab) => [tab.id, tab.project]),
  );
  const titleTabsRef = useRef(nextTitleTabs);
  if (!titleTabsEqual(titleTabsRef.current, nextTitleTabs)) {
    titleTabsRef.current = nextTitleTabs;
  }
  const titleTabs = titleTabsRef.current;

  // `history` now spans every visited project; consumers that expect the
  // current project only get this slice.
  const projectHistory = useMemo(
    () => history.filter((entry) => sameProjectPath(entry.cwd, sidebarCwd)),
    [history, sidebarCwd],
  );

  const sidebarHistoryRows = useMemo(
    () =>
      historyWithLiveSessions(
        history,
        // A habit's hidden run is never one of the project's chats.
        promptableSessions,
        sidebarCwd,
        {
          ...(projectBranches?.current
            ? { branch: projectBranches.current }
            : {}),
          ...(sidebarCwd && sidebarCwd !== "~"
            ? { repo: projectName(sidebarCwd) }
            : {}),
        },
        orchestrationRuns,
      ),
    [
      history,
      projectBranches,
      promptableSessions,
      sidebarCwd,
      orchestrationRuns,
    ],
  );
  const sidebarHistory = useStableValue(
    sidebarHistoryRows,
    sameSessionSummaries,
  );
  const {
    unseen: inboxUnseen,
    linkedSessionUpdateIds,
    linkedSessionUpdates,
  } = useInboxActivity(recents, sidebarCwd, sidebarHistory, {
    onAppeared: onInboxAppeared,
    scopeProject: appViewScope,
  });
  linkedSessionUpdatesRef.current = linkedSessionUpdates;
  const inboxRelatedSessions = useMemo(
    () => relatedInboxSessions(storedLinkedSessions, history, sessions),
    [history, sessions, storedLinkedSessions],
  );
  const repairSessions = useMemo(
    () => ciRepairSessions(history, sessions),
    [history, sessions],
  );
  const openProjectSessionRows = useMemo(
    () =>
      sessions
        .filter(
          (session) =>
            !session.inboxAsk &&
            !session.ephemeral &&
            !session.orchestrationLeadId &&
            sameProjectPath(session.cwd, sidebarCwd),
        )
        .map((session) =>
          summaryFromSession(session, {
            ...(projectBranches?.current
              ? { branch: projectBranches.current }
              : {}),
            ...(sidebarCwd && sidebarCwd !== "~"
              ? { repo: projectName(sidebarCwd) }
              : {}),
          }),
        ),
    [projectBranches, sessions, sidebarCwd],
  );
  const openProjectSessions = useStableValue(
    openProjectSessionRows,
    sameSessionSummaries,
  );

  const rightPanelToggleRef = useRef<(() => void) | null>(null);
  const onToggleSessionSidebar = useCallback(
    () => toggleSessionSidebar(workspaceStore),
    [],
  );
  const onToggleSidebar = useCallback(
    () => togglePrimarySidebar(workspaceStore, insetLayout),
    [insetLayout],
  );
  const onToggleSessionSidebarShortcut = useCallback(
    () =>
      toggleSessionSidebarShortcut(
        workspaceStore,
        insetLayout,
        rightPanelToggleRef.current,
      ),
    [insetLayout],
  );
  const onToggleProjectRail = useCallback(
    () => toggleProjectRail(workspaceStore),
    [],
  );

  const surfaceDeps = useStableFlow(
    (): SurfaceDeps => ({
      store: workspaceStore,
      setAutomationsViewOpen,
      setAutomationsSurfaceOpen,
      setLocalSurface,
      automationsSurfaceOpen: () => automationsSurfaceOpenRef.current,
      localSurface: () => localSurfaceRef.current,
      settingsReturnView: settingsReturnViewRef,
      rememberAppView: (view) => rememberAppView(view),
      cancelNavigation: () => workspaceNavigation.cancel(),
      closeFamiliarView: () => closeFamiliarView(),
      setSidebarTab: (tab, project) => setSidebarTab(tab, project),
      setComposerFocused: (focused) => setComposerFocused(focused),
      visitBack: () => onVisitBack(),
      visitForward: () => onVisitForward(),
      ensureOpenSession: (sessionId) => ensureOpenSession(sessionId),
      selectHistorySession: (sessionId) => onSelectHistorySession(sessionId),
    }),
  );
  const onGoToFile = useCallback(() => openFilePicker(surfaceDeps, ""), []);
  const onOpenCommandPalette = useCallback(
    () => openFilePicker(surfaceDeps, ">"),
    [],
  );
  const onReload = useCallback(() => {
    void (async () => {
      if (!(await confirmReload(dirtyFilesRef.current.size > 0))) return;
      window.location.reload();
    })();
  }, []);

  const onFindInProject = useCallback(() => findInProject(surfaceDeps), []);

  const onOpenSearch = useCallback(() => openAppView(surfaceDeps, "search"), []);

  const onLeaveSearch = useCallback(() => {
    setSearchViewOpen(false);
  }, []);

  const onOpenInbox = useCallback(() => openAppView(surfaceDeps, "inbox"), []);

  const onOpenLinkedWorkItem = linkedPanels.open;

  const onLeaveInbox = useCallback(() => {
    setInboxViewOpen(false);
  }, []);

  const onOpenInboxSession = useCallback(
    (sessionId: string) => openInboxSession(inboxDeps, sessionId),
    [],
  );
  const onRepairChecks = useCallback(
    (item: InboxItem, request: CiRepairRequest, sessionId?: string) =>
      repairChecks(inboxDeps, item, request, sessionId),
    [],
  );

  const onOpenNotes = useCallback(() => openAppView(surfaceDeps, "notes"), []);

  const onLeaveNotes = useCallback(() => {
    setNotesViewOpen(false);
  }, []);

  const onOpenAutomations = useCallback(
    () => openAppView(surfaceDeps, "automations"),
    [],
  );

  const onLeaveAutomations = useCallback(() => {
    setAutomationsViewOpen(false);
  }, []);

  const {
    onOpenLocalSurface,
    onOpenKnowledge,
    onLeaveLocalSurface,
    onOpenHomeSession,
    onOpenHomeAutomation,
    onAutomationsFocusConsumed,
    localSurfaceRailActions,
  } = useLocalSurfaceActions({
    surfaces: localSurfaces,
    setFilePickerOpen,
    setSettingsOpen,
    setSearchViewOpen,
    setInboxViewOpen,
    setNotesViewOpen,
    setSidebarTab,
    sessionsRef,
    history,
    onSelectHistorySession,
    railBadges,
  });

  const onOpenAutomationSession = useCallback(
    (sessionId: string) => openAutomationSession(surfaceDeps, sessionId),
    [],
  );

  const openSettings = useCallback(
    (section?: SettingsSectionId, anchor?: SettingsAnchor) =>
      openSettingsSurface(surfaceDeps, section, anchor),
    [],
  );

  const onOpenSettings = useCallback(() => openSettings(), [openSettings]);
  useEffect(() => {
    const openConnections = () => openSettings("connections");
    window.addEventListener(OPEN_CONNECTIONS_EVENT, openConnections);
    return () =>
      window.removeEventListener(OPEN_CONNECTIONS_EVENT, openConnections);
  }, [openSettings]);
  useEffect(() => {
    const open = () => setRemoteProjectDialogOpen(true);
    window.addEventListener(OPEN_REMOTE_PROJECT_EVENT, open);
    return () => window.removeEventListener(OPEN_REMOTE_PROJECT_EVENT, open);
  }, []);

  useEffect(() => {
    const onOpenMcp = () => openSettings("mcp");
    window.addEventListener("molfar:open-mcp-settings", onOpenMcp);
    return () =>
      window.removeEventListener("molfar:open-mcp-settings", onOpenMcp);
  }, [openSettings]);

  const onOpenNotificationSettings = useCallback(
    (path?: string) => openNotificationSettings(surfaceDeps, path),
    [],
  );

  const onOpenInboxIntegrations = useCallback(
    (source: ConnectableInboxSource) => openSettings("inbox", source),
    [openSettings],
  );

  const onCloseSettings = useCallback(() => closeSettings(surfaceDeps), []);

  const onSelectSettingsSection = useCallback(
    (section: SettingsSectionId) => selectSettingsSection(surfaceDeps, section),
    [],
  );

  const onOpenArchivedSession = useCallback(
    (sessionId: string) => {
      setSettingsOpen(false);
      void onSelectHistorySession(sessionId);
    },
    [onSelectHistorySession],
  );

  const onRailBack = useCallback(
    () => railBack(surfaceDeps, () => closeSettings(surfaceDeps)),
    [],
  );

  const onRailForward = useCallback(() => railForward(surfaceDeps), []);

  useEffect(() => {
    if (sidebarTab === "inbox") setSidebarTab("sessions");
  }, [sidebarTab]);

  useEffect(() => {
    if (!dockVisible) setProjectTerminalFocused(false);
  }, [dockVisible]);

  const openFilePaths = useMemo(() => {
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const tab of tabs) {
      for (const pane of tab.editorPanes) {
        for (const file of pane.files) {
          if (!isFilesystemTab(file) || seen.has(file.path)) continue;
          seen.add(file.path);
          paths.push(file.path);
        }
      }
    }
    return paths;
  }, [tabs]);

  useEffect(() => {
    void invoke("set_traffic_lights_visible", { visible: true }).catch(
      () => {},
    );
  }, []);

  const onSessionNavigationOrder = useCallback((ids: readonly string[]) => {
    sessionNavigationIdsRef.current = ids;
  }, []);

  const onNavigateSessionList = useCallback(
    (delta: number, inCurrentTab = false) =>
      navigateSessionList(sessionListDeps, delta, inCurrentTab),
    [],
  );

  const onNavigateProjectList = useCallback(
    (delta: number) =>
      stepProject(
        {
          currentProject: () => projectCwdRef.current,
          selectProject: onSelectProject,
          noteStep: noteProjectStep,
        },
        delta,
      ),
    [onSelectProject],
  );

  const onOpenBoardCard = useCallback(
    (cardId: string) => openBoardCard(onOpenLocalSurface, cardId),
    [onOpenLocalSurface],
  );
  const onOpenUsageSurface = useCallback(
    () => onOpenLocalSurface("usage"),
    [onOpenLocalSurface],
  );
  const displayedTabsDeps = useStableFlow(
    (): DisplayedTabsDeps => ({
      store: workspaceStore,
      navigation: displayedTabNavigation,
      visible: () => visibleTabsRef.current,
      activeTabIdRef,
      setOpenAppViews,
      setOpenFamiliarTabs,
      setTitleTabOrder,
      setAutomationsViewOpen,
      openFamiliar: (familiarId) => onOpenFamiliar(familiarId),
      openAppView: (view) => openAppView(surfaceDeps, view),
      activateTab: (tabId) => activateTab(tabId),
      closeFamiliarView: () => closeFamiliarView(),
      workspace: {
        closeTitleTab: (tabId) => onCloseTitleTab(tabId),
        closeTabs: (ids, fallbackId) => onCloseTabs(ids, fallbackId),
        closeEveryTab: (ids) => onCloseEveryTab(ids),
        reorderTabs: (ids, movedId) => onReorderTabs(ids, movedId),
        closeFocused: () => renderedTabActions.current.onCloseFocused(),
        next: () => renderedTabActions.current.onNext(),
        prev: () => renderedTabActions.current.onPrev(),
        activate: (slot) => renderedTabActions.current.onActivate(slot),
        closeOtherTabs: () => onCloseOtherTabs(),
        closeAllTabs: () => onCloseAllTabs(),
      },
    }),
  );
  const displayedTabs = useStableFlow(() => createDisplayedTabs(displayedTabsDeps));
  const visibleTabShortcuts = useStableFlow(() =>
    createVisibleTabShortcuts(displayedTabsDeps, displayedTabs),
  );
  const onSelectTitleTab = displayedTabs.selectTitleTab;
  const onCloseDisplayedTab = displayedTabs.closeDisplayedTab;
  const onCloseDisplayedTabs = displayedTabs.closeDisplayedTabs;
  const onCloseAllDisplayedTabs = displayedTabs.closeAllDisplayedTabs;
  const onReorderDisplayedTabs = displayedTabs.reorderDisplayedTabs;
  const {
    closeVisibleTab: onCloseVisibleTab,
    cycleVisibleTab: onCycleVisibleTab,
    activateVisibleTab: onActivateVisibleTab,
    closeOtherVisibleTabs: onCloseOtherVisibleTabs,
    closeAllVisibleTabs: onCloseAllVisibleTabs,
  } = visibleTabShortcuts;

  displayedTabNavigation.current = {
    tabs: insetLayout ? titleTabs : [],
    activeId: settingsOpen
      ? ""
      : familiarCovers
        ? (familiarViewTabId ?? "")
        : activeAppView
          ? appViewTabId(activeAppView)
          : activeTabId,
    select: onSelectTitleTab,
  };

  visibleTabsRef.current = {
    insetLayout,
    familiarTabId: familiarCovers ? familiarViewTabId : undefined,
    activeAppView,
    activeTabId,
    titleTabs,
  };

  const actions = useLatestRef<WorkspaceActions>({
    onNewFocused,
    onArchiveFocusedSession,
    onCloseOtherTabs: onCloseOtherVisibleTabs,
    onCloseAllTabs: onCloseAllVisibleTabs,
    onCloseFocused: onCloseVisibleTab,
    onNext: () => onCycleVisibleTab(1),
    onPrev: () => onCycleVisibleTab(-1),
    onVisitBack,
    onVisitForward,
    onActivate: onActivateVisibleTab,
    onSplit,
    onFocusDir,
    onToggleSidebar,
    onToggleSessionSidebar: onToggleSessionSidebarShortcut,
    onToggleFamiliar,
    onGoToFile,
    onOpenCommandPalette,
    onReload,
    onFindInProject,
    onOpenSearch,
    onOpenInbox,
    onOpenNotes,
    pickProject,
    onNewTerminal,
    onNewTerminalTab,
    onToggleProjectTerminal,
    onNavigateSessionList,
    onNavigateProjectList,
    openSettings,
    onOpenApprovalSession,
    onOpenBoardCard,
  });
  const run = useCommandRunner();
  const isMainWindowRef = useLatestRef(isMainWindow);
  const commandDeps = useStableFlow(
    (): CommandDeps => ({
      actions,
      run,
      surfaces: () => {
        const state = workspaceStore.getState();
        return {
          search: state.searchViewOpen,
          inbox: state.inboxViewOpen,
          notes: state.notesViewOpen,
          automations: automationsViewOpenRef.current,
          settings: state.settingsOpen,
          filePicker: state.filePickerOpen,
          whatsNew: Boolean(state.whatsNewVersion),
          insetLayout: insetLayoutRef.current,
        };
      },
      sessions: () => sessionsRef.current,
      isMainWindow: () => isMainWindowRef.current,
    }),
  );
  useNativeKeybindings();
  useWorkspaceKeys(commandDeps);
  useMenuCommands(commandDeps);

  const dockPaintTarget = useCallback(
    () =>
      workspaceStore.getState().familiarViewId
        ? undefined
        : findProjectTerminal(projectTerminalsRef.current, projectCwdRef.current),
    [],
  );
  const dockSlide = useDockSlide({
    dock: currentProjectDock,
    projectCwd,
    familiarCovers,
    insetLayout,
    paintTarget: dockPaintTarget,
    commitSize: onProjectTerminalSize,
  });
  const dockClosingShown = dockSlide.closingShown;

  const lastRemoteSnapshot = useRef(new Map<string, HostSession>());
  const onRemoteSnapshot = useCallback(
    (shellId: string, snapshot?: HostSession) => {
      if (!snapshot) {
        lastRemoteSnapshot.current.delete(shellId);
        setSessions((current) =>
          current.map((entry) =>
            entry.id === shellId
              ? {
                  ...entry,
                  title: "New remote session",
                  blocks: [],
                  busy: false,
                }
              : entry,
          ),
        );
        return;
      }
      if (lastRemoteSnapshot.current.get(shellId) === snapshot) return;
      lastRemoteSnapshot.current.set(shellId, snapshot);
      setSessions((current) => {
        const shell = current.find((entry) => entry.id === shellId);
        if (!shell) return current;
        const project = remoteProjectFor(shell.cwd);
        if (!project) return current;
        return current.map((entry) =>
          entry.id === shellId
            ? remoteSessionState(entry, snapshot, project)
            : entry,
        );
      });
    },
    [],
  );

  const onManageWorktrees = useCallback(
    () => openSettings("worktrees"),
    [openSettings],
  );
  const onManageProviderAccounts = useCallback(
    () => openSettings("providers", "provider-accounts"),
    [openSettings],
  );

  useFloatingFamiliar(sessions, familiarsSnap, familiarsEnabled, {
    open: (monoId) =>
      ensureFamiliarSession(monoId, {
        home: homeDir,
        load: ensureOpenSession,
        create: newDefaultSession,
        add: (created) => {
          sessionsRef.current = [...sessionsRef.current, created];
          setSessions(sessionsRef.current);
        },
      }),
    submit: onSubmit,
    stop: onStop,
    approval: onApproval,
    question: onQuestionReply,
    questionInteraction: onQuestionInteraction,
    reveal: onOpenFamiliar,
    openArtifact: async (monoId, id) => {
      await onOpenFamiliar(monoId);
      const sessionId = findFamiliar(monoId)?.sessionId;
      if (sessionId) onOpenMonoArtifact(sessionId, id);
    },
    openFile: onOpenFile,
    resume: onUsageLimitResume,
    create: () => createFamiliar().id,
  });

  const sessionPaneProps: SharedPaneProps = {
    workspaceSwitchingSessionId: workspaceNavigation.pending
      ? active?.id
      : undefined,
    recents,
    hideProjectPicker: true,
    onFocus: onFocusPane,
    onClose: onClosePane,
    onCwdChange,
    onBranchChange,
    onWorktreeChange: onComposerWorktreeChange,
    onRemoteSnapshot,
    onWorkspaceModeChange,
    onWorktreeBaseChange,
    onManageWorktrees,
    onModelChange,
    onModelSettingsChange,
    onRuntimeModeChange,
    onSaveDraft,
    onRemoveDraft,
    onSubmit,
    onStop,
    onCompactContext,
    onPlaceSessionInFolder,
    onDeleteQueuedMessage,
    onEditQueuedMessage,
    onQueuedMessageEditingChange,
    onSteerQueuedMessage,
    onResumeQueue,
    onUsageLimitResume,
    onUsageLimitResumeAtReset,
    onUsageLimitDismiss,
    onUsageLimitAccountChange,
    onInboxCardDismiss,
    onLinkedWorkItemUpdateCardDismiss,
    onNoteCardDismiss,
    onHandoffCardDismiss,
    onOpenLinkedWorkItem,
    onArchiveSession: onArchiveHistorySession,
    onDeleteSession: onDeleteHistorySession,
    onApproval,
    onQuestionReply,
    onQuestionInteraction,
    onOpenFile,
    onOpenDiff,
    onOpenPlan,
    onBuildPlan,
    onSecondOpinion,
    onHandoff,
    onBtwSubmit,
    onBtwRetry,
    onBtwDelete,
    onBtwStop,
    onBtwModelChange,
    onNewTerminal: onNewTerminalInSession,
  };

  // Renames, mascot picks and new projects show up on the rail.
  const familiarViewFamiliar = familiarViewId ? familiarForSession(familiarViewId) : undefined;
  const familiarOverview = useFamiliarOverviewData(
    workspaceStore,
    familiarViewSession,
    sessions,
  );
  const familiarShownSessionPane = shownFamiliarSessionId
    ? sessions.find((session) => session.id === shownFamiliarSessionId)
    : undefined;
  const familiarShownSessionActive =
    !!familiarShownSessionPane && familiarShownSessionFocused;
  const familiarShownSessionView = familiarShownSessionPane
    ? {
        sessionId: familiarShownSessionPane.id,
        title: sessionDisplayTitle(
          familiarShownSessionPane.title,
          familiarShownSessionPane.harness,
        ),
        pane: (
          <SessionPane
            {...sessionPaneProps}
            session={familiarShownSessionPane}
            // The Familiar view covers the workspace, so a review opens
            // beside the chat rather than in a hidden tab.
            onOpenDiff={onOpenMonoDiff}
            // The Familiar runs this session; handing it off or asking for a
            // second opinion belongs in its own tab.
            onSecondOpinion={undefined}
            onHandoff={undefined}
            visible={familiarCovers}
            focused={familiarShownSessionActive && !projectTerminalFocused}
            inSplit={false}
            addToChatTarget={false}
            composerFocused={
              familiarShownSessionActive &&
              composerFocused &&
              !projectTerminalFocused
            }
            composerFocusToken={composerFocusToken}
          />
        ),
      }
    : undefined;
  const familiarOverviewPanel =
    familiarViewFamiliar && familiarViewSession ? (
      <FamiliarOverviewPanel
        store={workspaceStore}
        familiar={familiarViewFamiliar}
        session={familiarViewSession}
        overview={familiarOverview}
        sessions={sessions}
        history={history}
        shownSession={familiarShownSessionView}
        onShowLaunchedSession={familiarView.showLaunchedSession}
        onOpenSessionInWorkspace={onOpenMonoLaunchedSession}
        onApproval={onApproval}
        onOpenFile={onOpenFile}
        onOpenDiff={onOpenDiff}
      />
    ) : null;
  const familiarSettingsDialog =
    familiarCovers && familiarViewFamiliar && familiarViewSession ? (
      <FamiliarSettingsPanel
        store={workspaceStore}
        familiar={familiarViewFamiliar}
        session={familiarViewSession}
        onModelChange={onModelChange}
        onModelSettingsChange={onModelSettingsChange}
        onRuntimeModeChange={onRuntimeModeChange}
        onReset={onResetFamiliar}
      />
    ) : null;
  const busyProjectPaths = useStableValue(
    promptableSessions.flatMap((session) =>
      session.busy && session.cwd ? [session.cwd] : [],
    ),
  );
  const sidebarFamiliars = useFamiliarRail({
    enabled: familiarsEnabled,
    activeId: familiarViewFamiliar?.id,
    sessions,
    unseenReplies: familiarReplies.counts,
    onOpen: onOpenFamiliar,
    onCreate: onCreateFamiliar,
    onDelete: onDeleteFamiliar,
  });

  const chromeSurfaceOpen =
    searchViewOpen ||
    settingsOpen ||
    inboxViewOpen ||
    notesViewOpen ||
    automationsViewOpen;
  const compactProjectRail = collapsedProjectRailMode === "compact";
  const compactRailActive = compactProjectRail && !projectRailOpen;
  const appViewBesideRail = insetLayout || projectRailOpen || compactProjectRail;
  const appViewCompactRail = !insetLayout && compactRailActive;
  const compactTitleNavigation =
    IS_MAC && compactRailActive && !chromeSurfaceOpen;
  const compactTitleBar = compactTitleNavigation && !familiarCovers;
  // The inset layout keeps its tabs across the top of the window at all
  // times, with the rail and the card below them.
  const titleBarSpansWindow = insetLayout || compactTitleBar;
  const titleBarInBody = !insetLayout && !compactTitleBar;
  // Matches when the sidebar portals Explorer or Changes into the panel.
  const insetRightPanelShown =
    insetLayout &&
    (rightPanelOpen || rightPanelClosing) &&
    !settingsOpen &&
    !familiarCovers &&
    !activeAppView &&
    looksLikeProject(sidebarCwd);
  useRightPanelSlide(
    rightPanelOpen,
    rightPanelClosing,
    insetRightPanelShown,
    rightPanelRef,
    setRightPanelClosing,
  );
  const showRightPanelToggle =
    insetLayout && !settingsOpen && looksLikeProject(sidebarCwd);
  rightPanelToggleRef.current =
    showRightPanelToggle && !(familiarCovers && familiarViewFamiliar) && !activeAppView
      ? onToggleRightPanel
      : null;
  const workspaceTitleBar = (
    <WorkspaceTitleBar
      store={workspaceStore}
      tabs={titleTabs}
      inset={insetLayout}
      cwd={sidebarCwd}
      gitCwd={gitCwd}
      familiar={familiarViewFamiliar}
      familiarSession={familiarViewSession}
      familiarTabId={familiarViewTabId}
      overviewShown={!!familiarOverviewPanel}
      activeAppView={activeAppView}
      compactRail={compactTitleNavigation}
      showRightPanelToggle={showRightPanelToggle}
      rightPanelOpen={rightPanelOpen}
      onToggleRightPanel={onToggleRightPanel}
      onSettingsHeaderHost={setSettingsHeaderHost}
      onNew={onNew}
      onCloseFamiliarView={closeFamiliarView}
      onGoBack={onRailBack}
      onGoForward={onRailForward}
      onToggleSidebar={onToggleSidebar}
      onToggleSessionSidebar={onToggleSessionSidebar}
      onSelect={onSelectTitleTab}
      onNewTerminal={onNewTerminal}
      onOpenSettings={onOpenSettings}
      onOpenInbox={onOpenInbox}
      onOpenNotes={notesEnabled ? onOpenNotes : undefined}
      onClose={onCloseDisplayedTab}
      onCloseMany={onCloseDisplayedTabs}
      onCloseAll={onCloseAllDisplayedTabs}
      onArchiveTab={onArchiveTitleTab}
      onDeleteTab={onDeleteTitleTab}
      onReorder={onReorderDisplayedTabs}
      onPlaceOnPane={onPlaceTabOnPane}
      onPinFile={onPinFile}
      onSelectProject={onSelectProject}
    />
  );

  const sessionSidebar = (
    <WorkspaceSidebar
      store={workspaceStore}
      automationsViewOpen={automationsViewOpen}
      cwd={sidebarCwd}
      gitCwd={gitCwd}
      worktreeTabStats={worktreeTabStats}
      onSelectWorkspace={onSelectWorkspace}
      workspaceSwitchPending={
        workspaceNavigation.pending?.project === sidebarCwd
      }
      workspaceSwitchError={
        workspaceNavigation.error?.project === sidebarCwd
          ? workspaceNavigation.error.message
          : undefined
      }
      explorerRootLabel={explorerRootLabel}
      tab={sidebarTab}
      onTabChange={setSidebarTab}
      rightPanel={{
        host: rightPanelHost,
        open: rightPanelOpen || rightPanelClosing,
        tab: rightPanelTab,
        onTabChange: showRightPanel,
      }}
      onOpenFilesSearch={onFindInProject}
      sessions={sidebarHistory}
      busySessionIds={busySessionIds}
      approvalSessionIds={approvalSessionIds}
      activeSessionId={activeSessionId}
      status={historyFailed ? "error" : "idle"}
      pending={historyPending}
      onSelectSession={onSelectHistorySession}
      onSelectRemoteSession={onSelectRemoteSession}
      onRemoteSessionDeleted={onRemoteSessionDeleted}
      onPrefetchSession={onPrefetchHistorySession}
      onSessionNavigationOrder={onSessionNavigationOrder}
      onPlaceSessionOnPane={onPlaceSessionOnPane}
      onRenameSession={onRenameHistorySession}
      onArchiveSession={onArchiveHistorySession}
      onArchiveSessions={onArchiveHistorySessions}
      onPinSession={onPinHistorySession}
      onPinSessions={onPinHistorySessions}
      onSetSessionLinkedWorkItem={onSetHistorySessionLinkedWorkItem}
      reminders={sessionReminders.reminders}
      onSetReminders={sessionReminders.schedule}
      onCancelReminders={sessionReminders.cancel}
      onDeleteSession={onDeleteHistorySession}
      onDeleteSessions={onDeleteHistorySessions}
      onOpenFile={onOpenFile}
      onOpenTerminal={onOpenTerminal}
      onFileMoved={onFileMoved}
      onFileDeleted={onFileDeleted}
      onGoBack={onRailBack}
      onGoForward={onRailForward}
      onOpenDiff={onOpenWorkingTreeDiff}
      onOpenAllChanges={onOpenAllChanges}
      onOpenCommit={onOpenCommit}
      selectedDiffPath={
        activeTab ? selectedChangePath(activeTab, gitCwd) : undefined
      }
      selectedDiffKind={activeTab ? selectedChangeKind(activeTab) : undefined}
      selectedCommitSha={activeTab ? selectedCommitSha(activeTab) : undefined}
      textHarness={pickTextHarness(active?.harness)}
      busyProjectPaths={busyProjectPaths}
      liveAgents={liveAgents}
      onSelectAgent={onSelectLiveAgent}
      onStopAgent={onCloseLiveAgent}
      onSelectProject={onSelectProject}
      onOpenProject={pickProject}
      onRemoveProject={onRemoveProject}
      familiars={sidebarFamiliars}
      onNew={onNew}
      openSessions={openProjectSessions}
      onNewTerminal={onNewTerminal}
      onSearch={onOpenSearch}
      onOpenInbox={onOpenInbox}
      onOpenInboxItem={onOpenLinkedWorkItem}
      onOpenNotes={notesEnabled ? onOpenNotes : undefined}
      onOpenKnowledge={railSurfaces.knowledge ? onOpenKnowledge : undefined}
      knowledgeActive={localSurface === "knowledge"}
      onOpenAutomations={onOpenAutomations}
      onGoToFile={onGoToFile}
      automationsActive={automationsSurfaceOpen}
      railExtraActions={localSurfaceRailActions}
      localSurfaces={{
        active: localSurface,
        visible: railSurfaces,
        onOpen: onOpenLocalSurface,
        badges: railBadges,
      }}
      notesEnabled={notesEnabled}
      titleBarAbove={insetLayout || compactTitleBar}
      inset={insetLayout}
      onToggleProjectRail={onToggleProjectRail}
      unseenFinishedIds={unseenFinishedIds}
      inboxUnseen={inboxUnseen}
      linkedSessionUpdateIds={linkedSessionUpdateIds}
      onOpenSettings={onOpenSettings}
      onOpenNotificationSettings={onOpenNotificationSettings}
      onSelectSettingsSection={onSelectSettingsSection}
      onCloseSettings={onCloseSettings}
      onOpenWhatsNew={onOpenWhatsNew}
    />
  );

  const usageFooter =
    (chromeSurfaceOpen && !(insetLayout && activeAppView)) ||
    (familiarCovers && !insetLayout) ? null : (
      <WorkspaceUsageFooter
        store={workspaceStore}
        pressureSlot={setPressureChipHost}
        source={usageSource}
        activeTab={activeTab}
        onSelectAccount={onSelectProviderAccount}
        onManageAccounts={onManageProviderAccounts}
        onToggleTerminal={onToggleRunningTerminal}
        onNewTerminal={onNewTerminal}
        onToggleProjectTerminal={onToggleProjectTerminal}
        inset={insetLayout}
      />
    );

  return (
    <SessionStateContext.Provider value={sessionState}>
    <OrchestrationActions.Provider value={orchestrationActions}>
      <OrchestrationWorkers.Provider value={orchestrationWorkers}>
        <div
          className={`workspace-background flex h-full flex-col text-content ${
            insetLayout
              ? "inset-shell inset-outer"
              : HAS_NATIVE_GLASS
                ? "bg-background-base/[var(--window-background-opacity)]"
                : "bg-background-base"
          }`}
        >
          {titleBarSpansWindow ? workspaceTitleBar : null}
          <div className="flex min-h-0 min-w-0 flex-1">
            {insetLayout ? (
              <div
                ref={setInsetRailHost}
                className="inset-rail-host flex h-full shrink-0"
              >
                {sessionSidebar}
              </div>
            ) : null}
            {/* `contents` keeps the classic layout's flat row; the inset
                layout stacks the tabs, the card and the footer. */}
            <div
              className={
                insetLayout
                  ? "flex min-h-0 min-w-0 flex-1 flex-col"
                  : "contents"
              }
            >
              <div
                className={
                  insetLayout
                    ? "inset-card mr-1.5 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px] border border-stroke"
                    : "contents"
                }
              >
                {insetLayout ? null : sessionSidebar}

                <div
                  className={`flex min-h-0 min-w-0 flex-1 flex-col${
                    insetLayout ? "" : " body-glass"
                  }`}
                >
                  <div
                    className={
                      chromeSurfaceOpen
                        ? "hidden"
                        : "flex min-h-0 min-w-0 flex-1 flex-col"
                    }
                    aria-hidden={chromeSurfaceOpen}
                    inert={chromeSurfaceOpen || undefined}
                  >
                    {!IS_MAC ? (
                      <WorkspaceMenuBar
                        store={workspaceStore}
                        onNew={onNew}
                        onNewTerminal={onNewTerminal}
                        onToggleTerminal={onToggleProjectTerminal}
                        onGoToFile={onGoToFile}
                        onToggleSidebar={onToggleSidebar}
                        onToggleSessionSidebar={onToggleSessionSidebarShortcut}
                        onShowSourceControl={onToggleChanges}
                        onCloseTab={onCloseTab}
                        onCloseOtherTabs={onCloseOtherTabs}
                        onCloseAllTabs={onCloseAllTabs}
                        onPickProject={pickProject}
                        onFindInProject={onFindInProject}
                        onSearch={onOpenSearch}
                        onOpenInbox={onOpenInbox}
                        onOpenNotes={notesEnabled ? onOpenNotes : undefined}
                      />
                    ) : null}
                    <div className="flex min-h-0 min-w-0 flex-1">
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        {titleBarInBody ? workspaceTitleBar : null}

                        <main className="relative flex min-h-0 min-w-0 flex-1">
                          <div
                            ref={dockSlide.gridRef}
                            className="grid h-full min-h-0 min-w-0 flex-1"
                          >
                            <ProjectTerminalDocks
                              store={workspaceStore}
                              closingShown={dockClosingShown}
                              onFocus={focusProjectTerminal}
                              onHide={onHideProjectTerminal}
                              onSideChange={onProjectTerminalSide}
                              onSizePaint={dockSlide.paintSize}
                              onSizeCommit={dockSlide.commitSize}
                              onAddTerminal={onNewTerminal}
                              onSelectTerminal={onSelectProjectTerminal}
                              onCloseTerminal={onCloseProjectTerminal}
                              onCloseOtherTerminals={onCloseOtherProjectTerminals}
                              onReorderTerminals={onReorderProjectTerminals}
                              onTerminalMetaChange={onTerminalMetaChange}
                            />
                            <div
                              className="relative flex min-h-0 min-w-0 flex-row"
                              style={{ gridArea: "main" }}
                            >
                              <div className="relative min-h-0 min-w-0 flex-1">
                                <WorkspaceTabPanes
                                  store={workspaceStore}
                                  paneProps={sessionPaneProps}
                                  sessions={sessions}
                                  activeSessionId={active?.id}
                                  composerFocused={composerFocused}
                                  composerFocusToken={composerFocusToken}
                                  onSelectFile={onSelectFileSurface}
                                  onCloseFile={onCloseFile}
                                  onCloseOtherFiles={onCloseOtherFiles}
                                  onPinFile={onPinFile}
                                  onReorderFiles={onReorderFiles}
                                  onFileDirtyChange={onFileDirtyChange}
                                  onFileErrorCountChange={onFileErrorCountChange}
                                  transcriptPool={transcriptPool}
                                  onUpdatePlan={onUpdatePlan}
                                  onMovePane={onMovePane}
                                  onDetachPane={onDetachPane}
                                  onTerminalMetaChange={onTerminalMetaChange}
                                />
                                <FamiliarSessionPanes
                                  store={workspaceStore}
                                  paneProps={sessionPaneProps}
                                  sessions={sessions}
                                  insetLayout={insetLayout}
                                  familiar={familiarViewFamiliar}
                                  composerFocused={composerFocused}
                                  composerFocusToken={composerFocusToken}
                                  shownSessionActive={familiarShownSessionActive}
                                  onOpenArtifact={onOpenMonoArtifact}
                                  onOpenDiff={onOpenMonoDiff}
                                  onCommitChanges={onCommitMonoChanges}
                                  onOpenFamiliarSession={onOpenFamiliarSession}
                                  activityTurnId={familiarOverview.activityShownTurnId}
                                  launchedSessions={familiarOverview.launchedSessions}
                                />
                              </div>
                            </div>
                          </div>
                          <LinkedWorkItemPanels
                            store={workspaceStore}
                            shownSessionId={
                              chromeSurfaceOpen || familiarCovers
                                ? undefined
                                : activeLinkedWorkItemPanel?.sessionId
                            }
                            repairSessions={repairSessions}
                            onRepairChecks={onRepairChecks}
                            onOpenSession={onOpenInboxSession}
                            onClosePanel={linkedPanels.close}
                          />
                        </main>
                      </div>
                      {familiarCovers ? familiarOverviewPanel : null}
                      {familiarSettingsDialog}
                    </div>
                  </div>
                  <WorkspaceAppViews
                    store={workspaceStore}
                    insetLayout={insetLayout}
                    openAppViews={openAppViews}
                    notesEnabled={notesEnabled}
                    automationsOpen={automationsSurfaceOpen}
                    besideRail={appViewBesideRail}
                    compactRail={appViewCompactRail}
                    gitCwd={gitCwd}
                    sidebarCwd={sidebarCwd}
                    scopeProject={appViewScope}
                    history={projectHistory}
                    sessions={sessions}
                    automationsFocusId={automationsFocusId}
                    inboxAsk={
                      <div className="hidden" aria-hidden>
                        {sessions
                          .filter((session) => session.inboxAsk)
                          .map((session) => {
                            const visible =
                              inboxViewOpen &&
                              inboxAskPortal?.sessionId === session.id;
                            return (
                              <SessionSurface
                                key={session.id}
                                host={visible ? inboxAskPortal.host : undefined}
                              >
                                <SessionPane
                                  {...sessionPaneProps}
                                  session={session}
                                  visible={visible}
                                  focused={visible}
                                  inSplit={false}
                                  composerFocused={composerFocused}
                                  composerFocusToken={composerFocusToken}
                                />
                              </SessionSurface>
                            );
                          })}
                      </div>
                    }
                    localSurfaces={
                      <LocalSurfaceViews
                        surface={localSurface}
                        besideRail={appViewBesideRail}
                        compactRail={appViewCompactRail}
                        projectPaths={recents.map((project) => project.path)}
                        projectCwd={projectCwd}
                        onClose={onLeaveLocalSurface}
                        onToggleSidebar={onToggleSidebar}
                        onOpenSession={onOpenHomeSession}
                        onOpenAutomation={onOpenHomeAutomation}
                        onOpenAutomations={onOpenAutomations}
                        onOpenUsage={onOpenUsageSurface}
                        onOpenInbox={onOpenInbox}
                        taskBoard={taskBoard}
                      />
                    }
                    onToggleSidebar={onToggleSidebar}
                    onOpenFile={onOpenFile}
                    onOpenHistorySession={onSelectHistorySession}
                    onOpenProject={onSelectProject}
                    onLeaveSearch={onLeaveSearch}
                    onLeaveNotes={onLeaveNotes}
                    inbox={{
                      onClose: onLeaveInbox,
                      onStart: onStartInboxItem,
                      onAsk: onAskInboxItem,
                      onAskRestart: onRestartInboxAsk,
                      sessions: inboxRelatedSessions,
                      repairSessions,
                      onRepairChecks,
                      onOpenSession: onOpenInboxSession,
                      onOpenIntegrations: onOpenInboxIntegrations,
                    }}
                    automations={{
                      onFocusAutomationConsumed: onAutomationsFocusConsumed,
                      onClose: onLeaveAutomations,
                      onLaunch: (automation, run) => launchAutomation(automation, run, true),
                      onOpenSession: onOpenAutomationSession,
                    }}
                  />
                  <WorkspaceSettings
                    store={workspaceStore}
                    cwd={sidebarCwd}
                    sessions={sidebarHistory}
                    liveSessions={sessions}
                    onRemoveWorktree={onRemoveWorktree}
                    onCheckWorktreeRemoval={onCheckWorktreeRemoval}
                    onDeleteWorktreeSessions={onDeleteWorktreeSessions}
                    headerHost={insetLayout ? settingsHeaderHost : undefined}
                    onClose={onCloseSettings}
                    onSelectSection={onSelectSettingsSection}
                    onOpenSession={onOpenArchivedSession}
                    onArchiveSession={onArchiveHistorySession}
                    onDeleteSession={onDeleteHistorySession}
                    onRestoreProject={onRestoreProject}
                    onRemoveProject={onRemoveProject}
                    onOpenWhatsNew={onOpenWhatsNew}
                  />
                  {insetLayout ? null : usageFooter}
                </div>
                {insetLayout ? (
                  <InsetRightPanel
                    shown={insetRightPanelShown}
                    closing={rightPanelClosing}
                    resize={rightPanelResize}
                    onPane={setRightPanelRef}
                    onHost={setRightPanelHost}
                  />
                ) : null}
              </div>
              {insetLayout
                ? (usageFooter ??
                  // Settings has no footer, so the card runs down to the same
                  // gutter as its right edge.
                  <div
                    className={`${settingsOpen ? "h-1.5" : "h-[30px]"} shrink-0`}
                  />)
                : null}
            </div>
          </div>

          <WorkspacePickerDialogs
            store={workspaceStore}
            cwd={filesCwd}
            openPaths={openFilePaths}
            onOpenFile={onOpenFile}
            onReload={onReload}
          />
          <WorkspaceNotices
            pressure={{
              sessions: sessionsRef,
              onStopAgent: (id) => onStop(id, true),
              onStopSession: onStop,
              onPressureChange: transcriptPool.setResourcePressure,
              chipHost: pressureChipHost,
              insetChip: insetLayout,
            }}
            approvalNotices={hiddenApprovalToasts}
            onFocusApprovalSession={onOpenApprovalSession}
            onApproval={onApproval}
            reminders={sessionReminders}
            onOpenReminderSettings={() => openSettings("general", "notifications")}
          />
          <WorkspaceDialogs store={workspaceStore} onOpenProject={onSelectProject} />
        </div>
        <TranscriptPoolOutlet pool={transcriptPool} />
      </OrchestrationWorkers.Provider>
    </OrchestrationActions.Provider>
    </SessionStateContext.Provider>
  );
}
function sameSettings(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}
