import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { alertApp, confirmApp, getAppDialog } from "@/shared/lib/app-dialog";
import {
  startTransition,
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
import { useDragResize } from "@/shared/hooks/use-drag-resize";
import { beginLayoutTransition } from "@/shared/lib/layout-transition";
import {
  APP_VIEW_LABELS,
  appViewForTab,
  appViewTabId,
  isViewTab,
  familiarForTab,
  familiarTabId,
  nextDisplayedTabAfterClose,
  reconcileTitleTabOrder,
  type AppView,
} from "@/features/workspace/model/app-view-tabs";
import { AppViewSurface } from "@/features/workspace/ui/AppViewSurface";
import { flushSync } from "react-dom";
import { sessionConversationPage } from "@/features/agent-app/model/session-conversation";
import { readFamiliarConversation } from "@/features/familiars/model/familiar-conversation";
import {
  resumeFamiliarUsageLimit,
} from "@/features/familiars/model/familiar-usage-limit";
import {
  dismissQueuedFamiliarSessionCompletion,
  familiarSessionCompletionResult,
} from "@/features/familiars/model/familiar-session-completion";
import { commitTabSwitch } from "./model/navigation-performance";
import { SessionStateContext } from "@/features/sessions/model/session-state-store";
import { useWorkspaceSessions } from "./workspace/hooks/use-workspace-sessions";
import {
  handleAgentApp,
  canAccessAgentAppProject,
  type AppSessionListing,
  type AppSessionPlacement,
} from "@/features/agent-app/model/agent-app";
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
import {
  applySessionRemovalChange,
  type SessionRemovalChangeDeps,
} from "./workspace/flows/session-history/session-removal-change";
import { findUnusedSessionWorktree } from "./workspace/flows/session-history/unused-worktree";
import {
  openSavedSession,
  type OpenSavedSessionDeps,
} from "./workspace/flows/session-history/open-saved-session";
import { useIdleSessionDetach } from "./hooks/use-idle-session-detach";
import { useWorkspaceNavigation } from "./hooks/use-workspace-navigation";
import { submitWithSettlement } from "./model/managed-submission";
import { acceptQuickLaunch } from "./model/quick-launch-session";
import { requestBoardFocus } from "@/features/task-board/model/board-focus";
import { boardNoticeCard } from "@/features/task-board/services/notify";
import { updateSessionState } from "./model/session-state";
import { activeWorkspaceTab } from "./model/active-workspace-tab";
import { isBlankWorkspaceTab } from "./model/blank-workspace-tab";
import {
  captureSettingsReturnView,
  restoreSettingsReturnView,
} from "./model/settings-return/settings-return-view";
import type { SettingsReturnView } from "./model/settings-return/types";
import type { SubmissionAcceptance } from "./model/submission-acceptance";

import {
  invalidateProjectFiles,
  prefetchProjectFiles,
  rememberOpenedFile,
  resolveFileOpenRequest,
  resolveOpenablePath,
} from "@/features/files/model/file-index";
import { FilePicker } from "@/features/files/ui/FilePicker";
import { useInboxActivity } from "@/features/inbox/hooks/use-inbox-unseen";
import { HarnessUpdateNotice } from "@/features/providers/ui/HarnessUpdateNotice";
import { ApprovalToasts } from "@/features/sessions/ui/ApprovalToasts";
import { WindowControls } from "@/features/window-chrome/ui/WindowControls";
import {
  FamiliarOverview,
} from "@/features/familiars/ui/FamiliarOverview";
import { FamiliarSettingsDialog } from "@/features/familiars/ui/FamiliarSettingsDialog";
import { FamiliarActivityView } from "@/features/familiars/ui/FamiliarActivityView";
import {
  recordFamiliarSpawnedSession,
} from "@/features/familiars/model/familiar-spawned-sessions";
import { groupFamiliarTurns } from "@/features/sessions/model/transcript-activity";
import {
  DeleteSessionDialog,
  type SessionDeleteChoice,
} from "@/features/sessions/ui/DeleteSessionDialog";
import { ProviderSignInDialog } from "@/features/sessions/ui/ProviderSignInDialog";
import { ResourcePressureNotice } from "@/features/notifications/ui/ResourcePressureNotice";
import {
  applyInsetLayout,
  INSET_LAYOUT_DEFAULT,
  loadInsetLayout,
  loadRightPanelOpen,
  loadRightPanelTab,
  loadRightPanelWidth,
  RIGHT_PANEL_WIDTH_DEFAULT,
  RIGHT_PANEL_WIDTH_MAX,
  RIGHT_PANEL_WIDTH_MIN,
  saveProjectRailOpen,
  saveRightPanelOpen,
  saveRightPanelTab,
  saveRightPanelWidth,
  saveSessionSidebarOpen,
  subscribeInsetLayout,
  type RightPanelTab,
  type SidebarTabId,
} from "@/features/settings/model/appearance";
import { resolveAppShortcut } from "@/features/settings/model/app-shortcuts";
import {
  loadProjectSidebarTab,
  saveProjectSidebarTab,
} from "@/features/settings/model/project-sidebar-tab";
import {
  applyUiScale,
  loadUiScale,
  saveUiScale,
  UI_SCALE_DEFAULT,
  zoomInUiScale,
  zoomOutUiScale,
} from "@/features/settings/model/ui-scale";
import { resolveZoomKeybinding } from "@/features/settings/model/zoom-keybinding";
import { useProjectBranches } from "@/features/source-control/hooks/use-project-branches";
import {
  type WorktreeFocus,
  useWorktreeFocus,
} from "@/features/source-control/model/worktree-focus";
import { useProjectDiffStats } from "@/features/source-control/hooks/use-project-diff-stats";
import {
  createOrchestrationWorktree,
  createWorktree,
  detachSessionWorktree,
  listWorktrees,
  removeOrchestrationBranch,
  removeOrchestrationWorktree,
  type Worktree,
} from "@/features/source-control/model/worktrees";
import {
  orchestrationWorktreeBranchName,
} from "@/domain/git/worktree-branch";
import {
  homeDir,
  type GitHistoryCommit,
} from "@/platform/tauri/fs";
import { basename, displayPath, isEqualOrInside, pathKey, projectName, rebasePath } from "@/shared/lib/paths";
import type { GitFileDiffKind } from "@/domain/git/working-tree";
import { HAS_NATIVE_GLASS, IS_MAC } from "@/shared/lib/platform";
import { getUpdatePrompt } from "@/features/updates/model/update-prompt";
import { runUpdateFlow } from "@/features/updates/model/updater";
import { MenuBar } from "./shell/MenuBar";
import { NewLayoutNotice } from "./shell/NewLayoutNotice";
import { noteProjectStep, Sidebar } from "./shell/Sidebar";
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
  showFamiliarActivity,
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
import { withHarnessChoice } from "./model/harness-choice";
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
import { FamiliarViewActions, TitleBar } from "./shell/TitleBar";
import type { Tab as TitleTab } from "@/features/workspace/model/title-tab";
import { AppDialog } from "./shell/AppDialog";
import { UpdatePromptDialog } from "./shell/UpdatePromptDialog";
import { UsageFooter } from "./shell/UsageFooter";
import { WhatsNewDialog } from "./shell/WhatsNewDialog";

import {
  orchestrationCheckoutCwd,
  orchestrationProjectCwd,
  orchestrator,
  workspaceIdentity,
  type ControlOutcome,
} from "@/features/orchestration/model/orchestration";
import {
  validateOrchestrationSettings,
  withOrchestrationProposal,
} from "@/features/orchestration/model/orchestration-plan";
import type { OrchestrationProposal } from "@/domain/orchestration/proposal";
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
  applyDockGridStyle,
  findProjectTerminal,
  isVerticalDock,
  type DockSide,
} from "@/features/projects/model/project-terminal";

import {
  isPreparingHandoff,
  planComposerSwitch,
  sessionChildHarnesses,
} from "@/features/sessions/model/handoff";
import {
  preferredModelSettings,
  saveLastModelSettings,
  saveRecentModelChoice,
} from "@/features/sessions/model/models";
import {
  mergeModelSettings,
  resolveModel,
} from "@/integrations/harness/core/models/resolve-model";
import { modelsFor } from "@/integrations/harness/core/models/catalog-store";
import {
  confirmCloseTerminal,
  confirmCloseTerminals,
} from "@/features/terminal/model/terminal-close";
import {
  listRunningTerminals,
  newTerminalCwd,
  terminalTabLabel,
  type TerminalMetaPatch,
} from "@/features/terminal/model/terminal-tab";
import {
  appendSteerUser,
  bindHarnessSession,
  cancelHarnessTurn,
  canSteerHarness,
  forgetHarnessSession,
  migrateFamiliarCodexSession,
  isLiveHarness,
  latestTurnNeedsHarnessLogin,
  pickTextHarness,
  probeHarnessAvailability,
  refreshHarnessCatalogs,
  registerBuiltinHarnesses,
  respondHarnessApproval,
  respondHarnessQuestion,
  startHarnessBridge,
  steerHarnessTurn,
  stopHarnessSession,
  configureHarnessIdlePark,
  stopHarnessTextPrompts,
  stopStreaming,
  type ApprovalDecision,
  type UserQuestionReply,
} from "@/integrations/harness";
import { supportsHarnessLogin } from "@/integrations/harness/core/auth-support";

import {
  findSurfacePane,
  firstLeafId,
  focusedFileTab,
  isCommitTab,
  isFilesystemTab,
  isolateTerminalPanes,
  isTerminalTab,
  leafIds,
  neighborLeafId,
  newAgentTab,
  newEditorWorkspaceTab,
  newFileTab,
  newPlanTab,
  newTab,
  openChangesTab,
  openCommitTab,
  openEditorTab,
  openSessionChangesTab,
  openWorkspaceFile,
  pinEditorFile,
  previewWorkspaceFile,
  removePane,
  setSplitRatio,
  siblingLeafId,
  splitPane,
  surfacePanes,
  withSurfacePanes,
  type EditorPane,
  type FilePaneTab,
  type FocusDir,
  type PaneEdge,
  type SplitDir,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";

import { isHarnessAvailable } from "@/integrations/harness/core/availability";

import { mergeOrderedSubset, orderByIds } from "@/shared/lib/reorder";

import {
  releaseNotesForVersion,
  releaseNotesTitle,
} from "@/features/updates/model/release-notes";

import type { WindowTransferPayload } from "./model/window-transfer";

import type { OpenFileFn } from "@/features/search/model/search";
import {
  applySessionCheckpoint,
  finishSessionTurn,
  flushSessionCheckpoint,
  forgetSessionCheckpoint,
  notifyReviewChanged,
  sessionCheckpointCleanupSafe,
} from "@/features/sessions/model/checkpoint";
import {
  createEditedResendCoordinator,
} from "@/features/sessions/model/edit-last-turn";

import {
  rememberProjectLocation,
  type synchronizeProjectLocation,
} from "@/features/projects/model/project-location";
import {
  isLocalProject,
  isRemoteProjectPath,
  lastProjectPath,
  loadRecents,
  looksLikeProject,
  projectRailItems,
  rememberProject,
  sameProjectPath,
} from "@/features/projects/model/recents";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import {
  type ProviderAccountProvider,
  DEFAULT_PROVIDER_ACCOUNT_ID,
} from "@/domain/harness/provider-account";
import { applyAddToChatRequest } from "@/features/sessions/model/add-chat-to-workspace";
import { newWorkspaceSession } from "./model/new-workspace-session";
import {
  planTitle,
} from "@/features/sessions/model/plan";
import {
  ADD_TO_CHAT_EVENT,
  type AddToChatRequest,
} from "@/features/sessions/model/quote-draft";
import {
  newDefaultSession,
  newSession,
} from "@/features/sessions/model/session";
import {
  canReplaceSessionTitle,
  formatSessionTitle,
  sessionDisplayTitle,
  titleFromPrompt,
} from "@/domain/session/title";
import {
  sessionWorkCwd,
  removeSessionDraft,
  sessionDraftBlock,
  sessionNeedsInput,
  lastUserBlockId,
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
import {
  HARNESS_LABEL,
  HARNESSES,
  type HarnessId,
} from "@/domain/harness/harness";
import { createSessionRemover } from "@/features/sessions/model/session-removal";
import type { FamiliarSpawnedSession } from "@/domain/session/familiar-session";
import {
  applyDetachPaneToTab,
  applyPlaceSessionOnPane,
  applyPlaceTabOnPane,
  filterTabsForProject,
  switchSessionInTab,
  workspaceTabCwd,
  workspaceTabWorktree,
} from "@/features/workspace/model/workspace-tab-groups";

import { claimInboxAutomationRuns } from "@/features/automations/model/automation-events";
import {
  claimDueAutomations,
  recoverAutomationRuns,
  updateAutomationRun,
  type Automation,
  type AutomationRun,
  listAutomations,
} from "@/features/automations/model/automations";
import {
  NOTES_CHANGED_EVENT,
  upsertNote,
  loadNotes,
} from "@/features/notes/notes";
import type { NoteComposerCard } from "@/domain/notes/note-card";
import { useInputNotifications } from "@/features/notifications/hooks/use-input-notifications";
import { useSessionReminders } from "@/features/notifications/hooks/use-session-reminders";
import { hiddenApprovalNotices } from "@/features/notifications/model/approval-toast";
import { syncDockBadge } from "@/features/notifications/model/dock-badge";
import {
  announceSessionFinished,
  loadNotificationsEnabled,
  NOTIFICATION_CLICK_EVENT,
  probeNotificationPermission,
  setWindowFocused,
} from "@/features/notifications/model/notifications";
import { useQuickComposerLaunches } from "@/features/quick-composer/hooks/use-quick-composer-launches";
import type { QuickLaunch } from "@/features/quick-composer/model/quick-composer";
import {
  deleteSession,
  discardDraftSessionRecord,
  flushSessionWrites,
  getSession,
  readSession,
  repairSession,
  listLinkedSessions,
  listSessionsByProject,
  replaceInFlightSessions,
  saveWorkspaceSnapshot,
  setSessionArchived,
  setSessionPinned,
  shouldPersistSession,
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
  familiarWorksOn,
  isFamiliarSession,
  listFamiliars,
  loadOpenFamiliar,
  familiarForSession,
  familiarLook,
  familiarsSnapshot,
  familiarState,
  removeFamiliar,
  saveOpenFamiliar,
  subscribeFamiliars,
} from "@/features/familiars/model/familiar";
import {
  loadFamiliarFiles,
  readAgentFile,
  writeAgentFile,
} from "@/features/familiars/model/familiar-files";
import { useFamiliarHabits } from "./hooks/use-familiar-habits";
import { useFloatingFamiliar } from "./hooks/use-floating-familiar";
import {
  dropRelays,
  habitRunFamiliar,
  isHabitRun,
  noteHabitRunLaunch,
  relayApproval,
  loadHabits,
  updateHabits,
} from "@/features/familiars/model/familiar-habits";
import {
  detachFamiliarTabs,
  ensureFamiliarSession,
  resetFamiliarSession,
} from "@/features/familiars/model/familiar-workspace";
import {
  loadSessionFolders,
  placeSessionInFolder,
  saveSessionFolders,
  type SessionFolderTarget,
} from "@/features/sessions/model/session-folders";
import { nativeSkillContextForSession } from "@/features/sessions/model/session-skills";
import {
  resumeUsageLimitedSession,
} from "@/features/sessions/model/usage-limit";
import { ReminderNotices } from "@/features/sessions/ui/ReminderNotices";
import {
  TranscriptPool,
  TranscriptPoolOutlet,
} from "@/features/sessions/ui/TranscriptPool";
import {
  getArtifact,
  saveArtifact,
  recordArtifactCard,
  removeArtifactCard,
  ARTIFACT_DELETED_EVENT,
} from "@/features/artifacts/artifacts";
import type { MonoChangesRequest } from "@/features/familiars/ui/FamiliarChangesView";
import {
  warmNativeSkills,
} from "@/features/skills/model/skills";
import {
  adjacentItemId,
  shouldHandleListNavigation,
  tabCommand,
  tabCommandForKeybinding,
  tabCommandKeybinding,
} from "@/features/workspace/model/tab-keys";
import {
  cachedRemoteSessionSummary,
  OPEN_CONNECTIONS_EVENT,
  OPEN_REMOTE_PROJECT_EVENT,
  rememberRemoteSession,
  REMOTE_HISTORY_UPDATED,
  remoteSessionFor,
  remoteTabCwd,
} from "@/features/connections/model/connections";
import type { HostSession } from "@/domain/remote/protocol";
import {
  remotePath,
  remoteProjectFor,
  remoteSessionGitCwd,
} from "@/features/connections/model/remote-projects";
import {
  remoteSessionActions,
} from "@/features/connections/model/remote-session-actions";
import { remoteSessionState } from "@/features/connections/model/remote-session-state";
import { AddRemoteProjectDialog } from "@/features/connections/ui/AddRemoteProjectDialog";
import { findRemoteSessionTab } from "@/features/connections/model/remote-session-tabs";
import {
  handleEditorFindKey,
  openFindInActiveEditor,
} from "@/features/files/editor/editor-search";
import type { InboxItem } from "@/features/inbox/model/github-tasks";
import type { ConnectableInboxSource } from "@/features/inbox/model/inbox-filters";
import { requestTranscriptJump } from "@/features/sessions/model/transcript-jump";
import { SessionPane } from "@/features/sessions/ui/SessionPane";
import { SessionSurface } from "@/features/sessions/ui/SessionSurface";
import type { SettingsAnchor } from "@/features/settings/ui/SettingsView";
import { ProjectTerminalDock } from "@/features/terminal/ui/ProjectTerminalDock";
import { PaneTree } from "@/features/workspace/ui/PaneTree";
import { lazySurface } from "@/shared/ui/lazy-surface";
import { useLocalSurfaceActions } from "./model/local-surfaces/use-local-surface-actions";
import { useLocalSurfaceState } from "./model/local-surfaces/use-local-surface-state";
import { preloadNavigationWhenIdle } from "./model/preload-navigation";
import { LocalSurfaceViews } from "./ui/LocalSurfaceViews";


import { markLinkedSessionUpdateSeen } from "@/features/inbox/model/linked-session-seen";
import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";
import {
  linkedWorkItemFromAutomationEvent,
} from "@/features/sessions/model/session-work-item";

import { loadRailSurfaces } from "@/features/settings/model/project-rail";
import {
  keybindingPressed,
  loadAutosave,
  loadCloseToTray,
  loadFamiliarsEnabled,
  subscribeFamiliarsEnabled,
  loadDiffViewer,
  loadFileTabMode,
  loadIdleAgentLimit,
  loadKeybindingOverrides,
  loadLiveAgentsEnabled,
  loadNotesEnabled,
  matchCustomKeybinding,
  saveAutosave,
  saveSettingsSection,
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
import { filesInWorkspaceTabs } from "@/features/workspace/model/tab-files";

const SearchView = lazySurface(
  async () => {
    const module = await import("@/features/search/ui/SearchView");
    return { default: module.SearchView };
  },
  { suspense: false },
);
const SettingsView = lazySurface(
  async () => {
    const module = await import("@/features/settings/ui/SettingsView");
    return { default: module.SettingsView };
  },
  { suspense: false },
);
const InboxView = lazySurface(
  async () => {
    const module = await import("@/features/inbox/ui/InboxView");
    return { default: module.InboxView };
  },
  { suspense: false },
);
const LinkedWorkItemPanel = lazySurface(async () => {
  const module = await import("@/features/inbox/ui/InboxView");
  return { default: module.LinkedWorkItemPanel };
});
const NotesView = lazySurface(
  async () => {
    const module = await import("@/features/notes/ui/NotesView");
    return { default: module.NotesView };
  },
  { suspense: false },
);
const AutomationsView = lazySurface(
  async () => {
    const module = await import("@/features/automations/ui/AutomationsView");
    return { default: module.AutomationsView };
  },
  { suspense: false },
);

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function openSessionIds(tabs: WorkspaceTab[]): Set<string> {
  const ids = new Set<string>();
  for (const tab of tabs) {
    for (const id of leafIds(tab.layout)) ids.add(id);
  }
  return ids;
}

/** Stable empty tab list for the title bar while a Familiar is in full view. */
const NO_TITLE_TABS: [] = [];

/** In-app confirm. `window.confirm` is swallowed when a macOS menu accelerator fires. */
function confirmDiscardUnsaved(message: string): Promise<boolean> {
  return confirmApp(message, { kind: "warning" });
}

function titleTabsEqual(a: TitleTab[], b: TitleTab[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tab, index) => {
    const other = b[index];
    return (
      other != null &&
      tab.id === other.id &&
      tab.appView === other.appView &&
      tab.familiar?.mascot === other.familiar?.mascot &&
      tab.familiar?.color === other.familiar?.color &&
      tab.familiar?.status === other.familiar?.status &&
      tab.project === other.project &&
      tab.title === other.title &&
      tab.sessionCount === other.sessionCount &&
      tab.dirty === other.dirty &&
      tab.more.join("\u0000") === other.more.join("\u0000") &&
      tab.harnesses.join("\u0000") === other.harnesses.join("\u0000") &&
      tab.busyHarnesses.join("\u0000") === other.busyHarnesses.join("\u0000") &&
      (tab.doneHarnesses ?? []).join("\u0000") ===
        (other.doneHarnesses ?? []).join("\u0000") &&
      tab.files.join("\u0000") === other.files.join("\u0000") &&
      tab.multiPane === other.multiPane &&
      tab.fileFocused === other.fileFocused &&
      tab.blank === other.blank &&
      tab.terminal === other.terminal &&
      tab.previewFileId === other.previewFileId &&
      tab.groupId === other.groupId
    );
  });
}

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
    setFilesSearchOpen,
    setEditorNavigation,
    setFilePickerOpen,
    setFilePickerInitialQuery,
    setFilePickerResetToken,
    setDirtyFiles,
    setFileErrorCounts,
    setSearchViewOpen,
    setSearchFocusToken,
    setSearchViewFocusToken,
    setInboxViewOpen,
    setLinkedWorkItemPanels,
    setInboxAskPortal,
    setNotesViewOpen,
    setInspectedWorkerId,
    setWorkerDetailRequest,
    setSettingsOpen,
    setSettingsSection,
    setSettingsAnchor,
    setNotificationProjectPath,
    setNotificationSettingsRequest,
    setProjectRailOpen,
    setSessionSidebarOpen,
    setCollapsedProjectRailMode,
    setUpdateNotice,
    setWhatsNewVersion,
    setProviderSignInRequest,
    setSessionDeleteDialog,
    setRemoteProjectDialogOpen,
    setFamiliarViewId,
    setFamiliarOverviewOpen,
    setFamiliarOverviewTab,
    setFamiliarSettingsFor,
    setFamiliarChangesRequest,
    setFamiliarShownSession,
    setFamiliarOverviewDocument,
    setFamiliarShownSessionFocused,
  } = useWorkspaceActions(workspaceStore);
  const projectCwd = useWorkspaceField(workspaceStore, "projectCwd");
  const recents = useWorkspaceField(workspaceStore, "recents");
  const { sessions, setSessions, sessionsRef, sessionState } =
    useWorkspaceSessions(workspaceStore);
  const sessionDeleteDialog = useWorkspaceField(workspaceStore, "sessionDeleteDialog");
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
  const familiarOverviewTab = useWorkspaceField(workspaceStore, "familiarOverviewTab");
  const familiarSettingsFor = useWorkspaceField(workspaceStore, "familiarSettingsFor");
  const onOpenMonoArtifact = useCallback(
    (_sessionId: string, id: string) => openOverviewDocument(workspaceStore, id),
    [],
  );
  const familiarChangesRequest = useWorkspaceField(workspaceStore, "familiarChangesRequest");
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
  const familiarOverviewDocument = useWorkspaceField(workspaceStore, "familiarOverviewDocument");
  useEffect(() => {
    if (!familiarOverviewOpen) leaveOverviewItems(workspaceStore);
  }, [familiarOverviewOpen]);
  const familiarShownSessionFocused = useWorkspaceField(
    workspaceStore,
    "familiarShownSessionFocused",
  );
  const shownFamiliarSessionId = useStore(workspaceStore, shownFamiliarSession);
  const onShowFamiliarActivity = useCallback(
    (sessionId: string, turnId: string, blocks: Block[]) =>
      showFamiliarActivity(workspaceStore, sessionId, turnId, blocks),
    [],
  );
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
  const displayedTabNavigation = useRef<{
    tabs: readonly TitleTab[];
    activeId: string;
    select?: (id: string) => void;
  }>({ tabs: [], activeId: "" });
  const projectOfTab = useCallback(
    (id: string) => tabProjectsRef.current.get(id),
    [],
  );
  const projectRailOpen = useWorkspaceField(workspaceStore, "projectRailOpen");
  const sessionSidebarOpen = useWorkspaceField(workspaceStore, "sessionSidebarOpen");
  const tabCloseScope = "project" as const;
  const currentProjectDock = findProjectTerminal(projectTerminals, projectCwd);
  const dockVisible = !!currentProjectDock?.open;
  const filesSearchOpen = useWorkspaceField(workspaceStore, "filesSearchOpen");
  const searchFocusToken = useWorkspaceField(workspaceStore, "searchFocusToken");
  const searchViewOpen = useWorkspaceField(workspaceStore, "searchViewOpen");
  const searchViewFocusToken = useWorkspaceField(workspaceStore, "searchViewFocusToken");
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
  const [openAppViews, setOpenAppViews] = useState<AppView[]>([]);
  // Familiars open as title tabs in the inset layout, by Familiar id.
  const [openFamiliarTabs, setOpenFamiliarTabs] = useState<string[]>([]);
  const [titleTabOrder, setTitleTabOrder] = useState(() =>
    tabs.map((tab) => tab.id),
  );
  const activeAppView: AppView | undefined = searchViewOpen
    ? "search"
    : inboxViewOpen
      ? "inbox"
      : notesViewOpen
        ? "notes"
        : automationsSurfaceOpen
          ? "automations"
          : undefined;
  const rememberAppView = useCallback((view: AppView) => {
    setOpenAppViews((current) =>
      current.includes(view) ? current : [...current, view],
    );
  }, []);
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
  // The inset layout's project tools beside the card.
  const [rightPanelHost, setRightPanelHost] = useState<HTMLDivElement | null>(
    null,
  );
  const [rightPanelOpen, setRightPanelOpenState] = useState(loadRightPanelOpen);
  const [rightPanelTab, setRightPanelTabState] =
    useState<RightPanelTab>(loadRightPanelTab);
  // A closed panel keeps its contents until it has slid out.
  const [rightPanelClosing, setRightPanelClosing] = useState(false);
  const rightPanelOpenRef = useRef(rightPanelOpen);
  rightPanelOpenRef.current = rightPanelOpen;
  const showRightPanel = useCallback((tab: RightPanelTab) => {
    setRightPanelTabState(tab);
    saveRightPanelTab(tab);
    setRightPanelOpenState(true);
    setRightPanelClosing(false);
    saveRightPanelOpen(true);
  }, []);
  const onToggleRightPanel = useCallback(() => {
    const next = !rightPanelOpenRef.current;
    rightPanelOpenRef.current = next;
    saveRightPanelOpen(next);
    setRightPanelOpenState(next);
    setRightPanelClosing(!next);
  }, []);
  // Its handle sits on the left edge, so dragging left widens it.
  const rightPanelResize = useDragResize({
    direction: "left",
    min: RIGHT_PANEL_WIDTH_MIN,
    max: () =>
      Math.min(RIGHT_PANEL_WIDTH_MAX, Math.floor(window.innerWidth * 0.5)),
    defaultWidth: RIGHT_PANEL_WIDTH_DEFAULT,
    initial: loadRightPanelWidth(),
    onCommit: saveRightPanelWidth,
  });
  const rightPanelRef = useRef<HTMLDivElement | null>(null);
  const setRightPanelPane = rightPanelResize.setPaneRef;
  const setRightPanelRef = useCallback(
    (el: HTMLDivElement | null) => {
      rightPanelRef.current = el;
      setRightPanelPane(el);
    },
    [setRightPanelPane],
  );
  const rightPanelAnimation = useRef<Animation | null>(null);
  const endRightPanelTransition = useRef<(() => void) | null>(null);
  const rightPanelWasOpen = useRef(rightPanelOpen);
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
  const updateNotice = useWorkspaceField(workspaceStore, "updateNotice");
  const whatsNewVersion = useWorkspaceField(workspaceStore, "whatsNewVersion");
  const providerSignInRequest = useWorkspaceField(workspaceStore, "providerSignInRequest");
  const familiarsEnabled = useSyncExternalStore(
    subscribeFamiliarsEnabled,
    loadFamiliarsEnabled,
    () => true,
  );
  const familiarsSnap = useSyncExternalStore(subscribeFamiliars, familiarsSnapshot);
  // A deleted Familiar, or Familiars turned off, drop their tabs.
  const shownFamiliarTabs = useMemo(
    () =>
      insetLayout && familiarsEnabled
        ? openFamiliarTabs.filter((familiarId) => findFamiliar(familiarId))
        : [],
    // The roster is read through its snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [insetLayout, familiarsEnabled, openFamiliarTabs, familiarsSnap],
  );
  useLayoutEffect(() => {
    if (!insetLayout) return;
    setTitleTabOrder((order) =>
      reconcileTitleTabOrder(order, [
        ...tabs.map((tab) => tab.id),
        ...openAppViews.map(appViewTabId),
        ...shownFamiliarTabs.map(familiarTabId),
      ]),
    );
  }, [insetLayout, tabs, openAppViews, shownFamiliarTabs]);
  /** A Familiar hides the terminal, so reaching for one leaves it. */
  const leaveCoveringFamiliar = useCallback(() => {
    if (workspaceStore.getState().familiarViewId) closeFamiliarView();
  }, [closeFamiliarView]);
  const seenProviderSignInRequestsRef = useRef<Set<string> | null>(null);
  const seenProviderSignInRequests =
    seenProviderSignInRequestsRef.current ??
    (seenProviderSignInRequestsRef.current = new Set(
      sessions.flatMap((session) => {
        if (
          !supportsHarnessLogin(session.harness) ||
          !latestTurnNeedsHarnessLogin(session.blocks)
        ) {
          return [];
        }
        return [providerSignInRequestKey(session)];
      }),
    ));
  const settingsSection = useWorkspaceField(workspaceStore, "settingsSection");
  const settingsAnchor = useWorkspaceField(workspaceStore, "settingsAnchor");
  const notificationProjectPath = useWorkspaceField(workspaceStore, "notificationProjectPath");
  const notificationSettingsRequest = useWorkspaceField(workspaceStore, "notificationSettingsRequest");
  const editorNavigation = useWorkspaceField(workspaceStore, "editorNavigation");
  const editorNavigationToken = useRef(0);
  const filePickerOpen = useWorkspaceField(workspaceStore, "filePickerOpen");
  const filePickerInitialQuery = useWorkspaceField(workspaceStore, "filePickerInitialQuery");
  const filePickerResetToken = useWorkspaceField(workspaceStore, "filePickerResetToken");
  const dirtyFiles = useWorkspaceField(workspaceStore, "dirtyFiles");
  const fileErrorCounts = useWorkspaceField(workspaceStore, "fileErrorCounts");
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
  const tabVisitNav = useWorkspaceField(workspaceStore, "tabVisitNav");
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

  useEffect(() => {
    const openSessionForAddToChat = (event: Event) => {
      const detail = (event as CustomEvent<AddToChatRequest>).detail;
      if (!detail?.text) return;

      // Match notes/inbox: leave the overlay surface so the chat is visible.
      setSearchViewOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsViewOpen(false);
      setSidebarTab("sessions");
      setProjectTerminalFocused(false);
      setComposerFocused(true);

      const result = applyAddToChatRequest({
        sessions: sessionsRef.current,
        tabs: tabsRef.current,
        activeTabId: activeTabIdRef.current,
        projectCwd: projectCwdRef.current,
        fallbackCwd: sessionDefaults?.cwd,
        defaultRuntimeMode: sessionDefaults?.runtimeMode,
        text: detail.text,
        mode: detail.mode,
      });
      // null ⇒ a mounted session pane already owns add-to-chat (draft insert).
      if (!result) return;

      sessionsRef.current = result.sessions;
      tabsRef.current = result.tabs;
      setSessions(result.sessions);
      setTabs(result.tabs);
      setActiveTabId(result.activeTabId);
    };

    window.addEventListener(ADD_TO_CHAT_EVENT, openSessionForAddToChat);
    return () =>
      window.removeEventListener(ADD_TO_CHAT_EVENT, openSessionForAddToChat);
  }, [sessionDefaults?.cwd, sessionDefaults?.runtimeMode]);

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
      selectHistorySession: (sessionId) => onSelectHistorySessionRef.current(sessionId),
      ensureOpenSession: (sessionId) => ensureOpenSession(sessionId),
      submit: (...args) => onSubmitRef.current(...args),
    }),
  );
  const linkedPanels = useStableFlow(() => createLinkedWorkItemPanels(inboxDeps));
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

  const nextBusySessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (session.busy) {
        ids.add(session.id);
        if (session.orchestrationLeadId) ids.add(session.orchestrationLeadId);
      }
    }
    return ids;
  }, [sessions]);
  const busySessionIdsRef = useRef(nextBusySessionIds);
  if (!setsEqual(busySessionIdsRef.current, nextBusySessionIds)) {
    busySessionIdsRef.current = nextBusySessionIds;
  }
  const busySessionIds = busySessionIdsRef.current;

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
  const usageProviders = useMemo(() => {
    if (
      usageSource?.harness === "claude" ||
      usageSource?.harness === "codex" ||
      usageSource?.harness === "opencode" ||
      usageSource?.harness === "devin"
    ) {
      return [usageSource.harness];
    }
    return [];
  }, [usageSource?.harness]);
  const usageSession = useMemo(() => {
    if (!usageSource) return undefined;
    return {
      id: usageSource.id,
      harness: usageSource.harness,
      model: usageSource.model,
      authRequired: latestTurnNeedsHarnessLogin(usageSource.blocks),
      providerAccountId:
        usageSource.providerAccountId ??
        (usageSource.blocks.some((block) => block.role === "user")
          ? DEFAULT_PROVIDER_ACCOUNT_ID
          : undefined),
    };
  }, [
    usageSource?.id,
    usageSource?.harness,
    usageSource?.model,
    usageSource?.blocks,
    usageSource?.providerAccountId,
  ]);
  const activeProviderSignInRequest = useMemo(() => {
    if (
      !active ||
      !supportsHarnessLogin(active.harness) ||
      !latestTurnNeedsHarnessLogin(active.blocks)
    ) {
      return null;
    }
    return {
      key: providerSignInRequestKey(active),
      sessionId: active.id,
      harness: active.harness,
    };
  }, [active]);
  useEffect(() => {
    if (!activeProviderSignInRequest) return;
    if (seenProviderSignInRequests.has(activeProviderSignInRequest.key)) {
      return;
    }
    seenProviderSignInRequests.add(activeProviderSignInRequest.key);
    setProviderSignInRequest(activeProviderSignInRequest);
  }, [activeProviderSignInRequest, seenProviderSignInRequests]);
  useEffect(() => {
    if (
      providerSignInRequest &&
      active?.id !== providerSignInRequest.sessionId
    ) {
      setProviderSignInRequest(null);
    }
  }, [active?.id, providerSignInRequest]);
  const runningTerminals = useMemo(() => {
    const files: FilePaneTab[] = [];
    const dock = findProjectTerminal(projectTerminals, projectCwd);
    if (dock) files.push(...dock.pane.files);
    for (const tab of tabs) {
      for (const pane of tab.terminalPanes ?? []) {
        files.push(...pane.files);
      }
    }
    return listRunningTerminals(files);
  }, [projectCwd, projectTerminals, tabs]);
  const runningTerminalOpen = useMemo(() => {
    const ids = new Set(runningTerminals.map((terminal) => terminal.id));
    if (
      currentProjectDock?.open &&
      currentProjectDock.pane.files.some((file) => ids.has(file.id))
    ) {
      return true;
    }
    const focused = activeTab ? focusedFileTab(activeTab) : undefined;
    return !!focused && ids.has(focused.id);
  }, [activeTab, currentProjectDock, runningTerminals]);

  const nextApprovalSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const session of sessions) {
      if (sessionNeedsInput(session)) {
        ids.add(session.id);
        if (session.orchestrationLeadId) ids.add(session.orchestrationLeadId);
      }
    }
    return ids;
  }, [sessions]);
  const approvalSessionIdsRef = useRef(nextApprovalSessionIds);
  if (!setsEqual(approvalSessionIdsRef.current, nextApprovalSessionIds)) {
    approvalSessionIdsRef.current = nextApprovalSessionIds;
  }
  const approvalSessionIds = approvalSessionIdsRef.current;

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
  const [reminderNoticesHeight, setReminderNoticesHeight] = useState(0);
  const [harnessUpdateHeight, setHarnessUpdateHeight] = useState(0);
  const [newLayoutNoticeHeight, setNewLayoutNoticeHeight] = useState(0);
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
  const onSelectProviderAccount = useCallback(
    (provider: ProviderAccountProvider, accountId: string) => {
      const current = sessionsRef.current.find(
        (session) => session.id === active?.id,
      );
      if (!current || current.harness !== provider) return;

      // A limited session continues in place under the selected account.
      if (current.usageLimit && !current.busy) {
        void usageLimitAccountChangeRef.current?.(current.id, accountId);
        return;
      }

      if (current.blocks.length === 0 && !current.busy) {
        if (current.providerAccountId === accountId) return;
        updateSessionState(sessionsRef, setSessions, (sessions) =>
          sessions.map((session) =>
            session.id === current.id
              ? { ...session, providerAccountId: accountId }
              : session,
          ),
        );
        return;
      }

      const currentId =
        current.providerAccountId ?? DEFAULT_PROVIDER_ACCOUNT_ID;
      if (currentId === accountId) return;

      // Provider thread ids are account-owned. Keep the current conversation
      // pinned to its account and open a clean one for the selected profile.
      const session = {
        ...newSession(
          current.harness,
          current.cwd,
          current.model,
          current.runtimeMode,
          current.modelSettings,
        ),
        providerAccountId: accountId,
      };
      const tab = newTab(session.id);
      updateSessionState(sessionsRef, setSessions, (sessions) => [
        ...sessions,
        session,
      ]);
      appendTab(tab, current.cwd);
      setActiveTabId(tab.id);
      setComposerFocused(true);
    },
    [active?.id, appendTab],
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

  const onFocusPane = useCallback(
    (paneId: string) => {
      if (paneId === workspaceStore.getState().familiarViewId) {
        setFamiliarShownSessionFocused(false);
        setProjectTerminalFocused(false);
        setComposerFocused(true);
        return;
      }
      if (paneId === shownFamiliarSession(workspaceStore.getState())) {
        setFamiliarShownSessionFocused(true);
        setProjectTerminalFocused(false);
        setComposerFocused(true);
        return;
      }
      // Over the Familiar, only its sidebar holds panes outside the workspace: a
      // launched session sliding away as another opens. Its late focus must
      // not close the Familiar and send that session to its project.
      if (
        workspaceStore.getState().familiarViewId &&
        !tabsRef.current.some((tab) => leafIds(tab.layout).includes(paneId))
      )
        return;
      closeFamiliarView();
      if (
        tabsRef.current.find((tab) => tab.id === activeTabIdRef.current)
          ?.focusedId !== paneId
      )
        workspaceNavigation.cancel();
      setProjectTerminalFocused(false);
      if (inboxAskPortal?.sessionId === paneId) {
        setComposerFocused(true);
        return;
      }
      setTabs((prev) => {
        const selectedId = activeTabIdRef.current;
        const selected = prev.find((tab) => tab.id === selectedId);
        if (!selected || (selected.focusedId === paneId && !selected.diffFocused)) return prev;
        return prev.map((tab) => tab.id === selectedId
          ? { ...tab, focusedId: paneId, diffFocused: false }
          : tab);
      });
      setComposerFocused(
        sessionsRef.current.some((session) => session.id === paneId),
      );
    },
    [inboxAskPortal, closeFamiliarView],
  );

  const onOpenDiff = useCallback(
    (
      path?: string,
      session?: { sessionId: string; cwd: string },
      changeKind?: GitFileDiffKind,
      pin = false,
      options?: { exact?: boolean },
    ) => {
      void (async () => {
        const diffCwd = session?.cwd ?? gitCwdRef.current;
        const diffProjectCwd = session
          ? sessionsRef.current.find((entry) => entry.id === session.sessionId)
              ?.cwd
          : sidebarCwdRef.current;
        const resolved = path
          ? options?.exact
            ? path
            : ((await resolveOpenablePath(diffCwd, path)) ?? path)
          : undefined;
        if (resolved) rememberOpenedFile(diffCwd, resolved);
        setTabs((prev) =>
          prev.map((tab) => {
            if (tab.id !== activeTabId) return tab;
            if (session) {
              return openSessionChangesTab(
                tab,
                session.cwd,
                session.sessionId,
                resolved,
                diffProjectCwd,
                pin,
              );
            }
            if (loadDiffViewer() === "unified") {
              return openChangesTab(
                tab,
                diffCwd,
                resolved,
                changeKind,
                diffProjectCwd,
              );
            }
            if (!resolved) return tab;
            return openEditorTab(
              tab,
              newFileTab(resolved, diffCwd, true, changeKind, diffProjectCwd),
              { pin },
            );
          }),
        );
        setSidebarTab("changes", diffProjectCwd);
        setComposerFocused(false);
      })();
    },
    [activeTabId],
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
    (paneId: string, targetTabId: string, position: "before" | "after") => {
      const result = applyDetachPaneToTab({
        tabs: tabsRef.current,
        paneId,
        targetTabId,
        position,
      });
      if (!result) return;

      tabsRef.current = result.tabs;
      setTabs(result.tabs);
      setProjectTerminalFocused(false);
      activateTab(result.activeTabId, result.focusedId);
    },
    [activateTab],
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

  const onResetFamiliar = useCallback(
    async (sessionId: string): Promise<void> => {
      const current = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!current || !isFamiliarSession(sessionId))
        throw new Error("This Familiar's conversation is no longer available.");
      if (removingSessionIds.current.has(sessionId))
        throw new Error("This conversation is already being reset.");

      removingSessionIds.current.add(sessionId);
      sessionPersistence.dropPending(sessionId);
      invalidateLoadedSession(sessionId);
      try {
        await resetFamiliarSession(current, {
          stop: async (id) => {
            const latest = (await stopSessionForRemoval(id)) ?? current;
            const stopped = {
              ...stopStreaming(latest),
              queueStatus: "paused" as const,
            };
            sessionsRef.current = sessionsRef.current.map((session) =>
              session.id === id ? stopped : session,
            );
            setSessions(sessionsRef.current);
            return stopped;
          },
          remove: async (stopped) => {
            await Promise.all(
              sessionChildHarnesses(stopped).map((harness) =>
                forgetHarnessSession(harness, sessionId),
              ),
            );
            await flushSessionCheckpoint(sessionId);
            const imagePaths = stopped.blocks.flatMap((block) =>
              block.role === "image" && block.image ? [block.image.path] : [],
            );
            await orchestrator.deleteSession(sessionId, () =>
              deleteSession(sessionId, imagePaths),
            );
          },
          replace: (fresh) => {
            sessionPersistence.forget(sessionId);
            invalidateLoadedSession(sessionId);
            sessionsRef.current = sessionsRef.current.map((session) =>
              session.id === sessionId ? fresh : session,
            );
            setSessions(sessionsRef.current);
            setHistory((history) =>
              history.filter((entry) => entry.id !== sessionId),
            );
            setStoredLinkedSessions((history) =>
              history.filter((entry) => entry.id !== sessionId),
            );
            familiarView.replaceSession(sessionId, fresh.id);
          },
        });
      } finally {
        removingSessionIds.current.delete(sessionId);
      }
    },
    [invalidateLoadedSession, stopSessionForRemoval],
  );

  const onSelectHistorySession = useCallback(
    async (sessionId: string) => {
      workspaceNavigation.cancel();
      let session = await ensureOpenSession(sessionId);
      if (!session || session.inboxAsk) return;
      const familiar = familiarForSession(session.id);
      if (familiar) {
        await onOpenFamiliar(familiar.id);
        return;
      }
      const parentId =
        session.orchestrationLeadId ??
        orchestrator.forSession(sessionId)?.leadId;
      if (parentId && parentId !== sessionId) {
        setInspectedWorkerId(sessionId);
        session = await ensureOpenSession(parentId);
        if (!session) return;
      }
      setSearchViewOpen(false);
      setSettingsOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsViewOpen(false);
      if (looksLikeProject(session.cwd))
        setProjectCwd(normalizeProjectPath(session.cwd));
      const linkedUpdate = linkedSessionUpdatesRef.current.get(session.id);
      if (focusOpenSession(session.id)) {
        if (linkedUpdate) revealLinkedSessionUpdate(session.id, linkedUpdate);
        return;
      }
      if (replaceBlankPaneWithSession(session)) {
        if (linkedUpdate) revealLinkedSessionUpdate(session.id, linkedUpdate);
        return;
      }
      const tab = newTab(session.id);
      appendTab(tab, session.cwd);
      setActiveTabId(tab.id);
      setComposerFocused(true);
      if (linkedUpdate) revealLinkedSessionUpdate(session.id, linkedUpdate);
    },
    [
      appendTab,
      ensureOpenSession,
      onOpenFamiliar,
      focusOpenSession,
      replaceBlankPaneWithSession,
      revealLinkedSessionUpdate,
    ],
  );
  const onSelectHistorySessionRef = useRef(onSelectHistorySession);
  onSelectHistorySessionRef.current = onSelectHistorySession;

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
    async (sessionId: string, targetId: string, edge: PaneEdge) => {
      if (sessionId === targetId) return;
      const targetTab = tabsRef.current.find((tab) =>
        leafIds(tab.layout).includes(targetId),
      );
      if (!targetTab) return;

      const alreadyHere = leafIds(targetTab.layout).includes(sessionId);
      if (!alreadyHere) {
        const session = await ensureOpenSession(sessionId);
        if (!session) return;
      }

      const tab = tabsRef.current.find((entry) => entry.id === targetTab.id);
      if (!tab || !leafIds(tab.layout).includes(targetId)) return;

      const replaceTarget =
        !leafIds(tab.layout).includes(sessionId) &&
        isBlankSession(
          sessionsRef.current.find((entry) => entry.id === targetId),
        );

      if (replaceTarget) {
        sessionPersistence.forgetSaved(targetId);
        const blank = sessionsRef.current.find(
          (entry) => entry.id === targetId,
        );
        if (blank) void forgetHarnessSession(blank.harness, targetId);
      }

      const result = applyPlaceSessionOnPane({
        tabs: tabsRef.current,
        sessions: sessionsRef.current,
        sessionId,
        targetId,
        edge,
        replaceTarget,
        scope: tabCloseScope,
        createReplacement: (seed) =>
          newDefaultSession(
            seed?.cwd ?? projectCwdRef.current,
            seed?.runtimeMode,
          ),
      });
      if (!result) return;

      sessionsRef.current = result.sessions;
      tabsRef.current = result.tabs;
      setSessions(result.sessions);
      setTabs(result.tabs);
      setActiveTabId(result.activeTabId);
      setProjectTerminalFocused(false);
      setComposerFocused(true);
    },
    [ensureOpenSession, tabCloseScope],
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

  const onRemoveHistorySession = useCallback(
    async (
      sessionId: string,
      mode: "archive" | "delete",
      skipDeleteConfirm = false,
      origin: "ui" | "cli" = "ui",
    ): Promise<boolean> => {
      if (
        removingSessionIds.current.has(sessionId) ||
        switchingWorktrees.current.has(sessionId) ||
        deleteConfirmationPending.current
      )
        return false;
      const open = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      const summary = history.find((entry) => entry.id === sessionId);
      const seed = open ?? summary;
      const label = seed
        ? sessionDisplayTitle(seed.title, seed.harness)
        : "this session";
      removingSessionIds.current.add(sessionId);
      let deleteWorktreePath: string | undefined;
      if (mode === "delete" && !skipDeleteConfirm) {
        deleteConfirmationPending.current = true;
        const unusedWorktree = await findUnusedSessionWorktree(
          sessionId,
          seed,
          sessionsRef.current,
        );
        if (!unusedWorktree) {
          deleteConfirmationPending.current = false;
        } else {
          const choice = await new Promise<SessionDeleteChoice>((resolve) => {
            setSessionDeleteDialog({ title: label, unusedWorktree, resolve });
          });
          deleteConfirmationPending.current = false;
          if (!choice.confirmed) {
            removingSessionIds.current.delete(sessionId);
            return false;
          }
          if (choice.deleteWorktree) deleteWorktreePath = unusedWorktree;
        }
      }
      invalidateLoadedSession(sessionId);
      sessionPersistence.dropPending(sessionId);
      try {
        const remover = createSessionRemover({
          mode,
          preserveOpenFiles: origin === "cli",
          scope: tabCloseScope,
          replacement: {
            harness: seed?.harness ?? "cursor",
            cwd: seed?.cwd ?? sidebarCwd,
            model: seed?.model,
            runtimeMode: seed?.runtimeMode,
            modelSettings: open?.modelSettings,
          },
          workspace: {
            snapshot: () => ({
              tabs: tabsRef.current,
              sessions: sessionsRef.current,
              activeTabId: activeTabIdRef.current,
              dirtyFiles: dirtyFilesRef.current,
            }),
            apply: (change) =>
              applySessionRemovalChange(
                removalChangeDeps,
                { sessionId, summary },
                change,
              ),
          },
          confirm: async (closedTabs, removalMode) => {
            if (origin === "cli") return true;
            const files = filesInWorkspaceTabs(closedTabs);
            const unsaved = files.some(
              (file) =>
                isFilesystemTab(file) && dirtyFilesRef.current.has(file.id),
            );
            if (
              unsaved &&
              !(await confirmDiscardUnsaved(
                `${removalMode === "archive" ? "Archive" : "Delete"} this conversation with unsaved files?`,
              ))
            )
              return false;
            const terminals = files.filter((file) => file.terminal);
            return (
              terminals.length === 0 || (await confirmCloseTerminals(terminals))
            );
          },
          stop: stopSessionForRemoval,
        });
        const removed = await remover.remove(sessionId);
        if (removed && deleteWorktreePath && seed) {
          try {
            await onRemoveWorktree(seed.cwd, deleteWorktreePath, false);
          } catch (error) {
            void alertApp(
              `The session was deleted. Its worktree was kept.\n\n${String(error)}\n\nYou can manage it in Settings → Worktrees.`,
              { kind: "warning" },
            );
          }
        }
        return removed;
      } catch (error) {
        if (origin === "cli") throw error;
        const detail = error instanceof Error ? error.message : String(error);
        void alertApp(`Could not ${mode} this conversation.\n\n${detail}`, {
          kind: "error",
        });
        return false;
      } finally {
        removingSessionIds.current.delete(sessionId);
      }
    },
    [
      history,
      invalidateLoadedSession,
      sidebarCwd,
      stopSessionForRemoval,
      tabCloseScope,
      onRemoveWorktree,
    ],
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

  /** Deletes the Familiar's conversation, then the Familiar. Its files stay on disk. */
  const onDeleteFamiliar = useCallback(
    async (familiarId: string) => {
      const familiar = findFamiliar(familiarId);
      if (!familiar) return;
      const { name } = familiarLook(familiar);
      const confirmed = await confirmApp(
        `Delete ${name}? Its conversation will be deleted and its habits stop. This can’t be undone.`,
        { title: "MOLFAR", kind: "warning", okLabel: "Delete" },
      );
      if (!confirmed) return;
      if (familiar.sessionId) {
        if (workspaceStore.getState().familiarViewId === familiar.sessionId) closeFamiliarView();
        if (
          sessionsRef.current.some(
            (session) => session.id === familiar.sessionId,
          ) ||
          history.some((entry) => entry.id === familiar.sessionId)
        ) {
          const removed = await onRemoveHistorySession(
            familiar.sessionId,
            "delete",
            true,
          );
          if (!removed) return;
        }
      }
      removeFamiliar(familiarId);
      familiarView.forget(familiarId);
    },
    [closeFamiliarView, history, onRemoveHistorySession],
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

  const onRatio = useCallback(
    (tabId: string, splitId: string, index: number, ratio: number) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, layout: setSplitRatio(t.layout, splitId, index, ratio) }
            : t,
        ),
      );
    },
    [],
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

  const onFileMoved = useCallback((from: string, to: string) => {
    invalidateProjectFiles();
    setTabs((prev) =>
      prev.map((tab) => {
        return {
          ...tab,
          editorPanes: tab.editorPanes.map((pane) => ({
            ...pane,
            files: pane.files.map((file) =>
              isFilesystemTab(file)
                ? { ...file, path: rebasePath(file.path, from, to) }
                : file,
            ),
          })),
        };
      }),
    );
  }, []);

  const applyProjectLocationChange = useCallback(
    (from: string, to: string) => moveProjectLocation(projectDeps, from, to),
    [],
  );

  const onFileDeleted = useCallback((path: string) => {
    invalidateProjectFiles();
    const dropped = new Set<string>();
    for (const tab of tabsRef.current) {
      for (const pane of tab.editorPanes) {
        for (const file of pane.files) {
          if (isFilesystemTab(file) && isEqualOrInside(file.path, path)) {
            dropped.add(file.id);
          }
        }
      }
    }
    setTabs((prev) =>
      prev.map((tab) =>
        dropOpenFiles(tab, (filePath) => isEqualOrInside(filePath, path)),
      ),
    );
    if (dropped.size === 0) return;
    setDirtyFiles((prev) => {
      const next = new Set(prev);
      for (const id of dropped) next.delete(id);
      return next;
    });
  }, []);

  const onOpenFile = useCallback<OpenFileFn>(
    (path, navigation, options) => {
      closeFamiliarView();
      void (async () => {
        const fileCwd = gitCwdRef.current;
        const fileProjectCwd = sidebarCwdRef.current;
        const resolved = await resolveFileOpenRequest(fileCwd, path, options);
        rememberOpenedFile(fileCwd, resolved);
        const tab = tabsRef.current.find(
          (entry) => entry.id === activeTabIdRef.current,
        );
        if (!tab) return;
        const file = newFileTab(
          resolved,
          fileCwd,
          false,
          undefined,
          fileProjectCwd,
        );
        const pin = !!options?.pin;
        if (loadFileTabMode() === "workspace") {
          // Built once: the updater may run twice in StrictMode.
          const created = newEditorWorkspaceTab(
            pin ? file : { ...file, preview: true },
          );
          let target: { tabId: string; paneId?: string } | undefined;
          // Select inside the updater, not from `tabsRef`: two opens resuming
          // before a render would otherwise both miss the preview and append
          // twice. flushSync runs the updater now so `target` is set below.
          flushSync(() => {
            setTabs((prev) => {
              const result = openWorkspaceFile(
                prev,
                file,
                created,
                (tabs, tab) => insertBesideActive(tabs, tab, fileProjectCwd),
                pin,
              );
              target = result;
              return result.tabs;
            });
          });
          if (target?.paneId) activateTab(target.tabId, target.paneId);
          else if (target) setActiveTabId(target.tabId);
          setProjectTerminalFocused(false);
          setComposerFocused(false);
          if (navigation) {
            editorNavigationToken.current += 1;
            setEditorNavigation({
              path: resolved,
              ...navigation,
              token: editorNavigationToken.current,
            });
          }
          return;
        }
        setTabs((prev) =>
          prev.map((entry) => {
            if (entry.id !== tab.id) return entry;
            const focusedSession = sessionsRef.current.find(
              (session) => session.id === entry.focusedId,
            );
            return openEditorTab(entry, file, {
              split: focusedSession?.blocks.length === 0 ? "left" : "right",
              pin,
            });
          }),
        );
        if (navigation) {
          editorNavigationToken.current += 1;
          setEditorNavigation({
            path: resolved,
            ...navigation,
            token: editorNavigationToken.current,
          });
        }
        setComposerFocused(false);
      })();
    },
    [activateTab, insertBesideActive, closeFamiliarView],
  );

  const onOpenPlan = useCallback(
    (sessionId: string, blockId: string) => {
      const tab = tabsRef.current.find((entry) => entry.id === activeTabId);
      const session = sessionsRef.current.find(
        (entry) => entry.id === sessionId,
      );
      const block = session?.blocks.find((entry) => entry.id === blockId);
      if (!tab || !session || !block) return;
      const file = {
        ...newPlanTab(
          session.id,
          block.id,
          planTitle(block.text),
          sessionWorkCwd(session),
        ),
        ...(session.worktreeCwd ? { projectCwd: session.cwd } : {}),
      };
      setTabs((prev) =>
        prev.map((entry) =>
          entry.id === tab.id ? openEditorTab(entry, file) : entry,
        ),
      );
      setComposerFocused(false);
    },
    [activeTabId],
  );

  const onPinFile = useCallback((fileId: string) => {
    setTabs((prev) => {
      const next = prev.map((tab) => pinEditorFile(tab, fileId));
      return next.some((tab, index) => tab !== prev[index]) ? next : prev;
    });
  }, []);

  const onFileDirtyChange = useCallback(
    (fileId: string, dirty: boolean) => {
      // An edited preview must not be replaced by the next click.
      if (dirty) onPinFile(fileId);
      setDirtyFiles((prev) => {
        if (prev.has(fileId) === dirty) return prev;
        const next = new Set(prev);
        if (dirty) next.add(fileId);
        else next.delete(fileId);
        return next;
      });
    },
    [onPinFile],
  );

  /** The editor reports 0 as it unmounts, so closed tabs drop out on their own. */
  const onFileErrorCountChange = useCallback(
    (fileId: string, count: number) => {
      setFileErrorCounts((prev) => {
        if ((prev.get(fileId) ?? 0) === count) return prev;
        const next = new Map(prev);
        if (count > 0) next.set(fileId, count);
        else next.delete(fileId);
        return next;
      });
    },
    [],
  );

  const onSelectFileSurface = useCallback((paneId: string, fileId: string) => {
    closeFamiliarView();
    setTabs((prev) =>
      prev.map((tab) => {
        const found = findSurfacePane(tab, paneId);
        if (!found) return tab;
        return withSurfacePanes(
          { ...tab, focusedId: paneId },
          found.kind,
          surfacePanes(tab, found.kind).map((pane) =>
            pane.id === paneId ? { ...pane, activeFileId: fileId } : pane,
          ),
        );
      }),
    );
    setComposerFocused(false);
  }, []);

  const onModelChange = useCallback(
    (sessionId: string, harness: HarnessId, model: string) => {
      const current = sessionsRef.current.find((s) => s.id === sessionId);
      if (!current) return;
      if (isPreparingHandoff(current)) return;
      const resolved = resolveModel(harness, model);
      saveRecentModelChoice(resolved.harness, resolved.id);
      if (current.modelSettings) {
        saveLastModelSettings(current.modelSettings, "fill");
      }
      const modelSettings = preferredModelSettings(
        resolved,
        current.modelSettings,
      );
      const plan = planComposerSwitch(current, harness);
      const recoverLimit =
        !current.busy &&
        !!current.usageLimit &&
        (current.harness !== harness || current.model !== resolved.id);
      if (plan.kind === "empty") {
        void forgetHarnessSession(plan.forget, sessionId);
      }
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          let next = withHarnessChoice(s, harness, resolved.id, modelSettings);
          if (plan.kind === "arm") {
            next = { ...next, pendingSwitch: plan.pending };
          } else if (plan.kind === "revert") {
            next = {
              ...next,
              pendingSwitch: undefined,
              ...(plan.restoreProviderSessionId
                ? { providerSessionId: plan.restoreProviderSessionId }
                : { providerSessionId: undefined }),
              ...(plan.restoreProviderAccountId
                ? { providerAccountId: plan.restoreProviderAccountId }
                : { providerAccountId: undefined }),
            };
          } else if (plan.kind === "empty") {
            next = { ...next, pendingSwitch: undefined };
          }
          return recoverLimit
            ? isFamiliarSession(sessionId)
              ? resumeFamiliarUsageLimit(next)
              : resumeUsageLimitedSession(next)
            : next;
        }),
      );
    },
    [],
  );

  const onModelSettingsChange = useCallback(
    (sessionId: string, modelSettings: Record<string, string>) => {
      saveLastModelSettings(modelSettings);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, modelSettings } : s)),
      );
    },
    [],
  );

  const onRuntimeModeChange = useCallback(
    (sessionId: string, runtimeMode: RuntimeMode) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, runtimeMode } : s)),
      );
    },
    [],
  );

  const onSaveDraft = useCallback(
    (
      sessionId: string,
      text: string,
      attachments: Attachment[] = [],
      appRequestId?: string,
    ) => {
      const current = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (current && remoteProjectFor(current.cwd))
        return !!remoteSessionActions(sessionId)?.saveDraft(text, attachments);
      if (
        !current ||
        current.busy ||
        sessionDraftBlock(current) ||
        current.inboxAsk ||
        current.worktreeRemoved ||
        (!text.trim() && attachments.length === 0)
      ) {
        return false;
      }
      const placeholderTitle = canReplaceSessionTitle(
        current.title,
        current.harness,
        HARNESS_LABEL[current.harness],
      );
      const title = placeholderTitle
        ? titleFromPrompt(text, current.harness, attachments)
        : current.title;
      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId && !sessionDraftBlock(session)
            ? {
                ...session,
                title,
                blocks: [
                  ...session.blocks,
                  {
                    id: crypto.randomUUID(),
                    role: "user",
                    text,
                    ...(attachments.length > 0 ? { attachments } : {}),
                    draft: true,
                    ...(appRequestId ? { appRequestId } : {}),
                  },
                ],
              }
            : session,
        ),
      );
      return true;
    },
    [],
  );

  const onRemoveDraft = useCallback(
    (sessionId: string, draftBlockId: string) => {
      const current = sessionsRef.current.find(
        (session) => session.id === sessionId,
      );
      if (!current) return false;
      const withoutDraft = removeSessionDraft(current, draftBlockId);
      if (!withoutDraft) return false;

      if (!shouldPersistSession(withoutDraft)) {
        sessionPersistence.dropPending(sessionId);
        sessionPersistence.forgetSaved(sessionId);
        sessionPersistence.forgetUserTurn(sessionId);
        invalidateLoadedSession(sessionId);
        setHistory((history) =>
          history.filter((session) => session.id !== sessionId),
        );
        setStoredLinkedSessions((history) =>
          history.filter((session) => session.id !== sessionId),
        );
        void discardDraftSessionRecord(sessionId).catch(() => undefined);
      }

      setSessions((sessions) =>
        sessions.map((session) =>
          session.id === sessionId
            ? (removeSessionDraft(session, draftBlockId) ?? session)
            : session,
        ),
      );
      return true;
    },
    [invalidateLoadedSession],
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

  useFamiliarHabits({
    sessions: () => sessionsRef.current,
    open: async (id) => (await ensureOpenSession(id)) ?? undefined,
    add: (session) => {
      sessionsRef.current = [...sessionsRef.current, session];
      setSessions(sessionsRef.current);
    },
    run: (id, prompt) =>
      new Promise((resolve) => {
        void submitWithSettlement({
          submit: (onSettled) => submitSession(id, prompt, [], { onSettled }),
          onSettled: resolve,
          rejectionMessage: "The habit's run could not start.",
        });
      }),
    remove: async (id) => {
      const open = await stopSessionForRemoval(id);
      if (open)
        await Promise.all(
          sessionChildHarnesses(open).map((harness) =>
            forgetHarnessSession(harness, id),
          ),
        );
      await deleteSession(id, []);
      sessionsRef.current = sessionsRef.current.filter(
        (session) => session.id !== id,
      );
      setSessions(sessionsRef.current);
    },
    post: (familiarId, habit, text, name, artifacts, launches) =>
      familiarChat.append(
        familiarId,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text,
          familiarHabit: { id: habit.id, name: habit.name, at: Date.now() },
          ...(artifacts?.length ? { artifactCards: artifacts } : {}),
          ...(launches?.length ? { familiarSpawnedSessions: launches } : {}),
        },
        (posted) => {
          familiarReplies.noteReply(familiarId);
          void announceSessionFinished(
            { ...posted, title: name },
            familiarId === activeSessionIdRef.current,
          );
        },
      ),
    // The chat shows it like any approval, and the usual approval banner
    // fires for the Familiar; the answer is routed back in onApproval.
    askApproval: (familiarId, habit, runId, block) => {
      const blockId = crypto.randomUUID();
      const requestId = relayApproval({
        familiarId,
        runId,
        requestId: block.approval!.requestId,
        blockId,
      });
      familiarChat.append(familiarId, {
        id: blockId,
        role: "approval",
        text: block.text,
        ...(block.tool ? { tool: block.tool } : {}),
        approval: { requestId },
        familiarHabit: { id: habit.id, name: habit.name, at: Date.now() },
      });
    },
    endApprovals: (runId) => {
      for (const relay of dropRelays(runId))
        familiarChat.decide(relay.familiarId, relay.blockId, "cancelled");
    },
  });

  const automationSessionReservations = useRef(new Set<string>());
  const automationRecoveryRef = useRef<Promise<void> | null>(null);
  const automationRecoveryCutoffRef = useRef(Date.now());

  const launchAutomation = useCallback(
    async (
      automation: Automation,
      run: AutomationRun,
      reveal = false,
      prompt = run.prompt ?? automation.prompt,
      sourceWorkItem?: LinkedWorkItem,
    ) => {
      let reservationId: string | undefined;
      let releaseAfterSettle = false;
      const releaseReservation = () => {
        if (!reservationId) return;
        automationSessionReservations.current.delete(reservationId);
        reservationId = undefined;
      };
      try {
        const eventRun = run.trigger === "event";
        const linkedWorkItem =
          sourceWorkItem ?? linkedWorkItemFromAutomationEvent(run);
        let session =
          automation.reuseSession && automation.lastSessionId
            ? sessionsRef.current.find(
                (entry) =>
                  entry.id === automation.lastSessionId &&
                  entry.harness === automation.harness &&
                  !entry.busy &&
                  !entry.worktreeRemoved &&
                  !automationSessionReservations.current.has(entry.id) &&
                  (automation.workspaceMode === "current"
                    ? entry.workspaceMode !== "worktree" &&
                      !entry.worktreeCwd &&
                      pathKey(entry.cwd) === pathKey(automation.cwd)
                    : automation.workspaceMode === "existing"
                      ? pathKey(sessionWorkCwd(entry)) ===
                        pathKey(automation.worktreeCwd ?? "")
                      : false),
              )
            : undefined;

        if (!session) {
          session = {
            ...newSession(
              automation.harness,
              automation.cwd,
              automation.model,
              automation.runtimeMode,
              automation.modelSettings,
            ),
            title: eventRun
              ? HARNESS_LABEL[automation.harness]
              : formatSessionTitle(automation.harness, automation.name),
            automationId: automation.id,
            ...(linkedWorkItem ? { linkedWorkItem } : {}),
            ...(automation.workspaceMode === "worktree"
              ? { workspaceMode: "worktree" as const, worktreeBase: "HEAD" }
              : automation.workspaceMode === "existing" &&
                  automation.worktreeCwd
                ? { worktreeCwd: automation.worktreeCwd }
                : {}),
          };
          const nextSessions = [...sessionsRef.current, session];
          sessionsRef.current = nextSessions;
          setSessions(nextSessions);
          const tab = newTab(session.id);
          appendTab(tab, automation.cwd);
          if (reveal) {
            setActiveTabId(tab.id);
            setComposerFocused(false);
          }
        } else {
          const stamped = {
            ...session,
            automationId: automation.id,
            model: automation.model,
            modelSettings: automation.modelSettings ?? {},
            runtimeMode: automation.runtimeMode,
            ...(linkedWorkItem ? { linkedWorkItem } : {}),
          };
          session = stamped;
          const nextSessions = sessionsRef.current.map((entry) =>
            entry.id === stamped.id ? stamped : entry,
          );
          sessionsRef.current = nextSessions;
          setSessions(nextSessions);
          if (reveal) {
            focusOpenSession(session.id);
          }
        }

        reservationId = session.id;
        automationSessionReservations.current.add(session.id);

        if (automation.sessionFolderId && looksLikeProject(automation.cwd)) {
          saveSessionFolders(
            automation.cwd,
            placeSessionInFolder(
              loadSessionFolders(automation.cwd),
              session.id,
              { kind: "existing", folderId: automation.sessionFolderId },
            ),
          );
        }

        if (reveal) {
          setSearchViewOpen(false);
          setInboxViewOpen(false);
          setNotesViewOpen(false);
          setAutomationsViewOpen(false);
          setSidebarTab("sessions", session.cwd);
        }

        await updateAutomationRun(run.id, "running", {
          sessionId: session.id,
        });
        // From here the settlement callback owns reservation cleanup, including
        // a rejected submission that never starts an agent turn.
        releaseAfterSettle = true;
        await submitWithSettlement({
          submit: (onSettled) =>
            submitSession(session.id, prompt, [], {
              refreshTitle: eventRun,
              onSettled,
            }),
          rejectionMessage:
            "The selected agent session could not start this run.",
          onSettled: (outcome) => {
            const status =
              outcome.status === "completed"
                ? "succeeded"
                : outcome.status === "cancelled"
                  ? "cancelled"
                  : "failed";
            void updateAutomationRun(run.id, status, {
              sessionId: session.id,
              ...(outcome.error ? { error: outcome.error } : {}),
            })
              .catch(() => undefined)
              .finally(releaseReservation);
          },
        });
      } catch (reason: unknown) {
        await updateAutomationRun(run.id, "failed", {
          error: reason instanceof Error ? reason.message : String(reason),
        }).catch(() => undefined);
        throw reason;
      } finally {
        if (!releaseAfterSettle) releaseReservation();
      }
    },
    [appendTab, focusOpenSession, submitSession],
  );

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
      acceptQuickLaunch(
        launch,
        deliveryId,
        {
          getSessions: () => sessionsRef.current,
          updateSessions: (update) => {
            sessionsRef.current = update(sessionsRef.current);
            // Compose with submission's queued transcript updates.
            setSessions(update);
          },
          appendTab,
          placeSession: (sessionId, target, cwd) => {
            const anchor = sessionsRef.current.find(
              (session) => session.id === target.besideSessionId,
            );
            const tab = tabsRef.current.find((entry) =>
              leafIds(entry.layout).includes(target.besideSessionId),
            );
            if (!anchor || !sameProjectPath(anchor.cwd, cwd) || !tab)
              throw new Error(
                "The target session must be open in this project",
              );
            const nextTabs = tabsRef.current.map((entry) =>
              entry.id === tab.id
                ? {
                    ...entry,
                    layout: splitPane(
                      entry.layout,
                      target.besideSessionId,
                      target.direction,
                      sessionId,
                    ),
                    focusedId: launch.reveal ? sessionId : entry.focusedId,
                    diffFocused: launch.reveal ? false : entry.diffFocused,
                  }
                : entry,
            );
            tabsRef.current = nextTabs;
            setTabs(nextTabs);
            return tab.id;
          },
          setProjectCwd,
          setRecents,
          revealTab: (id, cwd) => {
            setActiveTabId(id);
            setComposerFocused(false);
            setSearchViewOpen(false);
            setInboxViewOpen(false);
            setNotesViewOpen(false);
            setAutomationsViewOpen(false);
            setSidebarTab("sessions", cwd);
          },
          submit: (id, text, attachments, options) =>
            onSettled
              ? submitWithSettlement({
                  submit: (settle) =>
                    submitSession(id, text, attachments, {
                      ...options,
                      appRequestId: deliveryId,
                      onSettled: settle,
                    }),
                  onSettled,
                  rejectionMessage: "The monitored session could not start.",
                })
              : submitSession(id, text, attachments, options),
          saveDraft: (id, prompt, attachments, requestId) =>
            flushSync(() => onSaveDraft(id, prompt, attachments, requestId)),
        },
        placement,
        openTab,
      ),
    [appendTab, submitSession, onSaveDraft],
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
  const saveDraftRef = useRef(onSaveDraft);
  saveDraftRef.current = onSaveDraft;
  const ensureOpenSessionRef = useRef(ensureOpenSession);
  ensureOpenSessionRef.current = ensureOpenSession;

  const appReceipts = useRef(
    new Map<string, { signature: string; promise: Promise<unknown> }>(),
  );

  const ensureAutomationRecovery = useCallback(() => {
    if (!automationRecoveryRef.current) {
      const recovery = (async () => {
        const pending = await recoverAutomationRuns(
          automationRecoveryCutoffRef.current,
        );
        for (const item of pending) {
          await launchAutomation(
            item.automation,
            item.run,
            false,
            item.run.prompt ?? item.automation.prompt,
          ).catch(() => undefined);
        }
      })();
      automationRecoveryRef.current = recovery.catch((error: unknown) => {
        automationRecoveryRef.current = null;
        throw error;
      });
    }
    return automationRecoveryRef.current;
  }, [launchAutomation]);

  useEffect(() => {
    let disposed = false;
    let evaluating = false;
    const evaluate = async () => {
      if (disposed || evaluating) return;
      evaluating = true;
      try {
        await ensureAutomationRecovery();
        const due = await claimDueAutomations();
        for (const item of due) {
          if (disposed) break;
          void launchAutomation(item.automation, item.run).catch(
            () => undefined,
          );
        }
      } catch {
        // Scheduling retries on the next tick; individual claimed runs record
        // launch failures in launchAutomation.
      } finally {
        evaluating = false;
      }
    };
    void evaluate();
    const timer = window.setInterval(() => void evaluate(), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void evaluate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ensureAutomationRecovery, launchAutomation]);

  const onInboxAppeared = useCallback(
    (items: Parameters<typeof claimInboxAutomationRuns>[0]) => {
      void ensureAutomationRecovery()
        .then(() => claimInboxAutomationRuns(items))
        .then((due) => {
          for (const item of due) {
            void launchAutomation(
              item.automation,
              item.run,
              false,
              item.prompt,
              item.linkedWorkItem,
            ).catch(() => undefined);
          }
        })
        .catch(() => undefined);
    },
    [ensureAutomationRecovery, launchAutomation],
  );

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

  useLayoutEffect(() => {
    orchestrator.bind({
      session: (id) => sessionsRef.current.find((session) => session.id === id),
      sessions: () => sessionsRef.current,
      choices: () =>
        HARNESSES.filter(isHarnessAvailable).map((harness) => ({
          harness,
          models: modelsFor(harness).map(({ id, name }) => ({ id, name })),
        })),
      createWorker: async (run, task) => {
        const projectCwd = orchestrationProjectCwd(run);
        const leadCheckoutCwd = orchestrationCheckoutCwd(run);
        const lead = sessionsRef.current.find(
          (session) => session.id === run.leadId,
        );
        if (!lead) throw new Error("Lead session is unavailable");
        const workspace =
          task.workspacePolicy === "shared"
            ? workspaceIdentity(projectCwd, leadCheckoutCwd)
            : task.workspace
              ? await listWorktrees(leadCheckoutCwd).then((listed) => {
                  const tree = listed.worktrees.find(
                    (entry) =>
                      pathKey(entry.path) ===
                      pathKey(task.workspace!.checkoutCwd),
                  );
                  if (!tree)
                    throw new Error(
                      "This worker's retained worktree is missing. Its saved changes cannot be retried automatically.",
                    );
                  return workspaceIdentity(
                    projectCwd,
                    tree.path,
                    tree.branch ?? task.workspace!.branch,
                  );
                })
              : await createOrchestrationWorktree(
                  leadCheckoutCwd,
                  orchestrationWorktreeBranchName(task.id),
                ).then((tree) =>
                  workspaceIdentity(
                    projectCwd,
                    tree.path,
                    tree.branch ?? undefined,
                  ),
                );
        const checkoutCwd = workspace.checkoutCwd;
        const scratchDir = await invoke<string>("control_attach_worker", {
          leadId: run.leadId,
          sessionId: task.sessionId,
        });
        const existing = sessionsRef.current.find(
          (session) => session.id === task.sessionId,
        );
        if (existing) {
          if (
            existing.harness !== task.harness ||
            existing.model !== task.model ||
            !sameProjectPath(existing.cwd, projectCwd) ||
            (!existing.worktreeRemoved &&
              !sameProjectPath(sessionWorkCwd(existing), checkoutCwd))
          )
            throw new Error(
              "This worker's configuration changed. Restore its approved harness, model and project before retrying.",
            );
          // The lead's runtime mode governs its agents, including across a
          // change mid-run: auto stays auto, supervised asks the lead.
          const synced = {
            ...existing,
            cwd: projectCwd,
            worktreeCwd: sameProjectPath(projectCwd, checkoutCwd)
              ? undefined
              : checkoutCwd,
            branch: workspace.branch,
            worktreeRemoved: false,
            runtimeMode: lead.runtimeMode,
            orchestrationLeadId: run.leadId,
          };
          await upsertSession(synced);
          const next = sessionsRef.current.map((session) =>
            session.id === synced.id ? synced : session,
          );
          sessionsRef.current = next;
          setSessions(next);
          return { scratchDir, workspace };
        }
        const restored = await getSession(task.sessionId);
        if (
          restored &&
          (restored.harness !== task.harness || restored.model !== task.model)
        )
          throw new Error(
            "The saved worker no longer matches its approved model. Create a new assignment.",
          );
        const fresh = {
          ...newSession(task.harness, projectCwd, task.model, lead.runtimeMode),
          ...(sameProjectPath(projectCwd, checkoutCwd)
            ? {}
            : { worktreeCwd: checkoutCwd, branch: workspace.branch }),
          ...(task.modelSettings
            ? {
                modelSettings: mergeModelSettings(
                  resolveModel(task.harness, task.model),
                  task.modelSettings,
                ),
              }
            : {}),
        };
        const base = restored
          ? {
              ...restored,
              busy: false,
              cwd: projectCwd,
              worktreeCwd: sameProjectPath(projectCwd, checkoutCwd)
                ? undefined
                : checkoutCwd,
              branch: sameProjectPath(projectCwd, checkoutCwd)
                ? undefined
                : workspace.branch,
              worktreeRemoved: false,
              runtimeMode: lead.runtimeMode,
            }
          : {
              ...fresh,
              id: task.sessionId,
              title: task.title,
            };
        const worker = { ...base, orchestrationLeadId: run.leadId };
        if (worker.providerSessionId)
          bindHarnessSession(
            worker.harness,
            worker.id,
            worker.providerSessionId,
            sessionWorkCwd(worker),
            worker.providerAccountId,
            worker.blocks,
          );
        await upsertSession(worker);
        const next = [...sessionsRef.current, worker];
        sessionsRef.current = next;
        setSessions(next);
        // Workers belong to the lead's agent panel; no workspace tab is created.
        return { scratchDir, workspace };
      },
      integrateWorker: async (run, task) => {
        const fromCwd = task.workspace?.checkoutCwd;
        if (!fromCwd)
          throw new Error("This worker's isolated checkout is unavailable");
        const session = sessionsRef.current.find(
          (entry) => entry.id === task.sessionId,
        );
        if (session)
          await Promise.all(
            sessionChildHarnesses(session).map((harness) =>
              stopHarnessSession(harness, task.sessionId),
            ),
          );
        await invoke("harness_kill", { sessionId: task.sessionId });
        await invoke("control_turn_finished", { sessionId: task.sessionId });
        await flushSessionCheckpoint(task.sessionId);
        const listed = await listWorktrees(orchestrationCheckoutCwd(run));
        const workerTree = listed.worktrees.find((tree) =>
          sameProjectPath(tree.path, fromCwd),
        );
        const leadTree = listed.worktrees.find((tree) =>
          sameProjectPath(tree.path, orchestrationCheckoutCwd(run)),
        );
        if (!workerTree || !leadTree)
          throw new Error(
            "The worker or lead checkout is no longer registered. The worker worktree was kept.",
          );
        if (workerTree.head !== leadTree.head)
          throw new Error(
            "The worker or lead branch moved while this task was running. The worker worktree was kept for manual review.",
          );
        return applySessionCheckpoint(
          task.sessionId,
          fromCwd,
          orchestrationCheckoutCwd(run),
        );
      },
      cleanupWorker: async (run, task, onlyIfUnchanged) => {
        const workspace = task.workspace;
        if (!workspace || workspace.kind !== "worktree") return true;
        const path = workspace.checkoutCwd;
        await flushSessionCheckpoint(task.sessionId);
        const listed = await listWorktrees(orchestrationCheckoutCwd(run));
        const exists = listed.worktrees.some(
          (tree) => pathKey(tree.path) === pathKey(path),
        );
        if (!exists && onlyIfUnchanged) return false;
        const workerTree = listed.worktrees.find(
          (tree) => pathKey(tree.path) === pathKey(path),
        );
        const leadTree = listed.worktrees.find((tree) =>
          sameProjectPath(tree.path, orchestrationCheckoutCwd(run)),
        );
        if (
          exists &&
          (!workerTree || !leadTree || workerTree.head !== leadTree.head)
        ) {
          if (onlyIfUnchanged) return false;
          throw new Error(
            "The worker or lead branch moved before cleanup. The worker worktree was kept for manual review.",
          );
        }
        if (onlyIfUnchanged) {
          const safe = await sessionCheckpointCleanupSafe(task.sessionId, path);
          if (!safe) return false;
        } else if (exists) {
          // Re-verify immediately before destructive cleanup. The operation is
          // idempotent, so this also finishes a partially applied integration.
          await applySessionCheckpoint(
            task.sessionId,
            path,
            orchestrationCheckoutCwd(run),
          );
        }

        if (exists) {
          onStop(task.sessionId, true);
          const session = sessionsRef.current.find(
            (entry) => entry.id === task.sessionId,
          );
          if (session) {
            await Promise.all(
              sessionChildHarnesses(session).map((harness) =>
                stopHarnessSession(harness, task.sessionId),
              ),
            );
          }
          await invoke("harness_kill", { sessionId: task.sessionId });
          await invoke("control_turn_finished", {
            sessionId: task.sessionId,
          });
          await flushSessionWrites();
          checkOpenWorktreeFiles(worktreeDeps, path);
          const removed = await removeOrchestrationWorktree(
            orchestrationCheckoutCwd(run),
            path,
          );
          const affected = new Set([task.sessionId, ...removed.sessionIds]);
          sessionsRef.current = sessionsRef.current.map((session) =>
            affected.has(session.id)
              ? detachSessionWorktree(session, removed.projectCwd, path)
              : session,
          );
          setSessions(sessionsRef.current);
          const detachSummary = (entry: SessionSummary) =>
            affected.has(entry.id)
              ? detachSessionWorktree(entry, removed.projectCwd, path)
              : entry;
          setHistory((current) => current.map(detachSummary));
          setStoredLinkedSessions((current) => current.map(detachSummary));
          if (session)
            await Promise.allSettled(
              sessionChildHarnesses(session).map((harness) =>
                forgetHarnessSession(harness, task.sessionId),
              ),
            );
        } else {
          const detached = sessionsRef.current.find(
            (entry) => entry.id === task.sessionId,
          );
          if (detached && !detached.worktreeRemoved) {
            const next = detachSessionWorktree(
              detached,
              orchestrationProjectCwd(run),
              path,
            );
            sessionsRef.current = sessionsRef.current.map((entry) =>
              entry.id === task.sessionId ? next : entry,
            );
            setSessions(sessionsRef.current);
            if (shouldPersistSession(next)) await upsertSession(next);
          }
        }
        if (workspace.branch)
          await removeOrchestrationBranch(
            orchestrationCheckoutCwd(run),
            workspace.branch,
          );
        await forgetSessionCheckpoint(task.sessionId);
        notifyReviewChanged(task.sessionId);
        return true;
      },
      submit: (id, text, done) => {
        void submitWithSettlement({
          submit: (onSettled) => {
            let acceptance: SubmissionAcceptance = false;
            // Commit an immediate turn before another scheduler update. A
            // deferred submission flushes its own turn after synchronization.
            flushSync(() => {
              acceptance = submitSession(id, text, [], {
                managed: true,
                onSettled,
              });
            });
            return acceptance;
          },
          onSettled: done,
          rejectionMessage:
            "The selected agent session could not accept this turn.",
        }).catch(console.error);
      },
      steer: async (id, text) => {
        flushHarnessEvents();
        const session = sessionsRef.current.find((entry) => entry.id === id);
        if (!session) throw new Error("This agent is no longer available");
        if (!session.busy)
          throw new Error(
            "This agent is not running a turn; send it a fresh one with message.",
          );
        if (
          !isLiveHarness(session.harness) ||
          !canSteerHarness(session.harness)
        )
          throw new Error(
            `${session.harness} cannot take guidance mid-turn. Wait for the turn to finish, then use message.`,
          );
        // Record it on the worker before dispatch, so its own transcript shows
        // why it changed course even if the harness call then fails.
        const next = sessionsRef.current.map((entry) =>
          entry.id === id ? appendSteerUser(entry, text) : entry,
        );
        sessionsRef.current = next;
        setSessions(next);
        await steerHarnessTurn({
          harness: session.harness,
          sessionId: id,
          cwd: sessionWorkCwd(session),
          model: session.model,
          modelSettings: session.modelSettings,
          text,
        });
      },
      respondApproval: (id, requestId, decision) => {
        const session = sessionsRef.current.find((entry) => entry.id === id);
        if (session)
          respondHarnessApproval(session.harness, id, requestId, decision);
      },
      answerQuestion: (id, requestId, reply) => {
        const session = sessionsRef.current.find((entry) => entry.id === id);
        if (session)
          respondHarnessQuestion(session.harness, id, requestId, reply);
      },
      stop: async (id) => {
        const session = sessionsRef.current.find((entry) => entry.id === id);
        onStop(id, true);
        try {
          if (session)
            await Promise.all(
              sessionChildHarnesses(session).map((harness) =>
                stopHarnessSession(harness, id),
              ),
            );
        } finally {
          // Also reap processes left behind by a renderer reload, before the
          // corresponding session has been restored in this window.
          await invoke("harness_kill", { sessionId: id });
          await invoke("control_turn_finished", { sessionId: id });
        }
      },
    });
  }, [submitSession, onStop, flushHarnessEvents]);

  useEffect(() => {
    orchestrator.sync();
  }, [sessions]);

  const stopSessionRef = useRef(onStop);
  stopSessionRef.current = onStop;
  const removeSessionRef = useRef(onRemoveHistorySession);
  removeSessionRef.current = onRemoveHistorySession;

  useEffect(() => {
    const listening = listen<{
      id: string;
      namespace: string;
      sessionId: string;
      requestId: string;
      action: string;
      input: Record<string, unknown>;
    }>("molfar-control-request", ({ payload }) => {
      const handle = async () => {
        if (payload.namespace === "control") {
          return orchestrator.handle(
            payload.sessionId,
            payload.requestId,
            payload.action,
            payload.input,
          );
        }
        if (payload.namespace !== "app")
          throw new Error("Unknown CLI namespace");
        const source = sessionsRef.current.find(
          (session) => session.id === payload.sessionId,
        );
        if (
          !source ||
          source.inboxAsk ||
          source.orchestrationLeadId ||
          orchestrator.run(source.id)
        )
          throw new Error("This session cannot use the MOLFAR app CLI");
        const key = `${source.id}:${payload.requestId}`;
        const signature = JSON.stringify([payload.action, payload.input]);
        const previous = appReceipts.current.get(key);
        if (previous) {
          if (previous.signature !== signature)
            throw new Error("Request ID was already used with different input");
          return previous.promise;
        }
        const sourceFamiliar =
          familiarForSession(source.id) ?? findFamiliar(habitRunFamiliar(source.id) ?? "");
        const canAccessProject = (cwd: string) =>
          canAccessAgentAppProject(source, cwd, sourceFamiliar?.projects);
        const sourceTurn = turnGen.current.get(source.id) ?? 0;
        const sourceTurns = isFamiliarSession(source.id)
          ? groupFamiliarTurns(source.blocks)
          : [];
        const sourceTurnId = sourceTurns[sourceTurns.length - 1]?.[0]?.id;
        const rememberSession = (entry: FamiliarSpawnedSession) => {
          // A habit run is thrown away when it ends; its launches go on the
          // report it posts to the Familiar's chat instead.
          if (isHabitRun(source.id)) {
            noteHabitRunLaunch(source.id, entry);
            return;
          }
          if (!sourceTurnId) return;
          const next = sessionsRef.current.map((session) =>
            session.id === source.id
              ? recordFamiliarSpawnedSession(session, sourceTurnId, entry)
              : session,
          );
          if (
            next.every(
              (session, index) => session === sessionsRef.current[index],
            )
          )
            return;
          sessionsRef.current = next;
          setSessions(next);
        };
        const monitorCompletion = (
          familiarId: string,
          sessionId: string,
          requestId: string,
          project: string,
          prompt: string,
        ) => {
          const settle = familiarCompletions.batches.watch(
            { familiarId, turn: sourceTurn },
            requestId,
            sessionId,
            { awaitAcceptance: true },
          );
          return Object.assign(
            (outcome: ControlOutcome) =>
              settle(
                familiarSessionCompletionResult({
                  requestId,
                  sessionId,
                  project,
                  prompt,
                  outcome,
                  session: sessionsRef.current.find(
                    (session) => session.id === sessionId,
                  ),
                }),
              ),
            { accept: settle.accept, discard: settle.discard },
          );
        };
        const dismissCompletion = (sessionId: string) => {
          if (!isFamiliarSession(source.id)) return;
          familiarCompletions.batches.dismissSession(
            source.id,
            sessionId,
          );
          flushSync(() =>
            setSessions((previous) =>
              previous.map((session) =>
                session.id === source.id
                  ? dismissQueuedFamiliarSessionCompletion(session, sessionId)
                  : session,
              ),
            ),
          );
        };
        const promise = handleAgentApp(
          source,
          payload.requestId,
          payload.action,
          payload.input,
          {
            start: async (launch, id, placement, notifyFamiliarId) => {
              const rememberLaunch = () => {
                const created =
                  sessionsRef.current.find((session) => session.id === id) ??
                  existing;
                rememberSession({
                  sessionId: id,
                  cwd: created?.cwd ?? launch.cwd,
                  title: created?.title ?? launch.prompt.trim().slice(0, 300),
                  harness: created?.harness ?? launch.harness,
                  model:
                    created?.model ??
                    resolveModel(launch.harness, launch.model).id,
                });
              };
              const open = sessionsRef.current.find(
                (session) => session.id === id,
              );
              const stored = open ? null : await getSession(id);
              const existing = open ?? stored;
              const previous = existing?.blocks.find(
                (block) => block.appRequestId === id,
              );
              if (previous) {
                if (
                  previous.text !== launch.prompt ||
                  (!launch.draft && !!previous.draft)
                )
                  throw new Error(
                    "Request ID was already used for another session launch",
                  );
                rememberLaunch();
                return;
              }
              if (
                existing?.blocks.some(
                  (block) => block.role === "user" && !block.draft,
                )
              ) {
                rememberLaunch();
                return;
              }
              if (existing && sessionDraftBlock(existing))
                throw new Error("Session ID already has a different draft");
              const onSettled = notifyFamiliarId
                ? monitorCompletion(
                    notifyFamiliarId,
                    id,
                    id,
                    launch.cwd,
                    launch.prompt,
                  )
                : undefined;
              try {
                // Started sessions wait in the sidebar, under the session
                // that started them, until the user opens one. Only an
                // explicit split, or a reveal from a regular session, puts
                // one in the workspace.
                await launchQuickSessionRef.current(
                  launch,
                  id,
                  placement,
                  onSettled,
                  !!placement || (!isFamiliarSession(source.id) && launch.reveal),
                );
                rememberLaunch();
                onSettled?.accept();
              } catch (error) {
                onSettled?.discard();
                throw error;
              }
            },
            sessions: async (cwd): Promise<AppSessionListing[]> => {
              const stored = await listSessionsByProject(cwd);
              const byId = new Map<string, AppSessionListing>();
              for (const session of stored) {
                if (session.orchestrationLeadId || session.taskCardId) continue;
                byId.set(session.id, {
                  id: session.id,
                  title: session.title,
                  harness: session.harness,
                  model: session.model,
                  busy: false,
                  hasDraft: !!session.draft,
                  archived: !!session.archived,
                });
              }
              for (const session of sessionsRef.current) {
                if (
                  session.orchestrationLeadId ||
                  session.taskCardId ||
                  isHabitRun(session.id) ||
                  !sameProjectPath(session.cwd, cwd)
                )
                  continue;
                byId.set(session.id, {
                  id: session.id,
                  title: session.title,
                  harness: session.harness,
                  model: session.model,
                  busy: !!session.busy,
                  hasDraft: !!sessionDraftBlock(session),
                  archived: byId.get(session.id)?.archived ?? false,
                });
              }
              return [...byId.values()];
            },
            session: async (id) => {
              const target =
                sessionsRef.current.find((session) => session.id === id) ??
                (await getSession(id));
              return target &&
                !target.orchestrationLeadId &&
                canAccessProject(target.cwd)
                ? target
                : null;
            },
            readConversation: async (target, options) =>
              isFamiliarSession(target.id)
                ? readFamiliarConversation(target, options)
                : sessionConversationPage(target, options),
            send: async (id, prompt, requestId, notifyFamiliarId) => {
              const target = await ensureOpenSessionRef.current(id);
              if (
                !target ||
                target.orchestrationLeadId ||
                !canAccessProject(target.cwd) ||
                orchestrator.run(id)
              )
                throw new Error("Session is unavailable in this project");
              const rememberFollowUp = () => {
                const current =
                  sessionsRef.current.find((session) => session.id === id) ??
                  target;
                rememberSession({
                  sessionId: id,
                  cwd: current.cwd,
                  title: current.title,
                  harness: current.harness,
                  model: current.model,
                });
              };
              const previous = target.blocks.find(
                (block) => block.appRequestId === requestId,
              );
              if (previous) {
                if (previous.text !== prompt)
                  throw new Error(
                    "Request ID was already used with another prompt",
                  );
                if (previous.draft)
                  throw new Error("Request ID belongs to an unsent draft");
                rememberFollowUp();
                return { alreadySubmitted: true };
              }
              if (target.busy)
                throw new Error("Session is busy; try again when it finishes");
              if (sessionDraftBlock(target))
                throw new Error(
                  "Session already has a draft; send or remove it first",
                );
              const onSettled = notifyFamiliarId
                ? monitorCompletion(
                    notifyFamiliarId,
                    id,
                    requestId,
                    target.cwd,
                    prompt,
                  )
                : undefined;
              const accepted = onSettled
                ? await submitWithSettlement({
                    submit: (onSettled) =>
                      submitSessionRef.current(id, prompt, [], {
                        appRequestId: requestId,
                        onSettled,
                      }),
                    onSettled,
                    rejectionMessage:
                      "The monitored follow-up could not start.",
                  })
                : await submitSessionRef.current(id, prompt, [], {
                    appRequestId: requestId,
                  });
              if (!accepted) {
                onSettled?.discard();
                throw new Error("Session could not accept the follow-up");
              }
              rememberFollowUp();
              onSettled?.accept();
              return { alreadySubmitted: false };
            },
            draft: async (id, prompt, requestId) => {
              const target = await ensureOpenSessionRef.current(id);
              if (
                !target ||
                target.orchestrationLeadId ||
                !canAccessProject(target.cwd) ||
                orchestrator.run(id)
              )
                throw new Error("Session is unavailable in this project");
              const previous = target.blocks.find(
                (block) => block.appRequestId === requestId,
              );
              if (previous) {
                if (previous.text !== prompt)
                  throw new Error(
                    "Request ID was already used with another prompt",
                  );
                return { alreadySaved: true, draft: !!previous.draft };
              }
              if (target.busy)
                throw new Error("Session is busy; try again when it finishes");
              if (sessionDraftBlock(target))
                throw new Error(
                  "Session already has a draft; send or remove it first",
                );
              const saved = flushSync(() =>
                saveDraftRef.current(id, prompt, [], requestId),
              );
              if (!saved) throw new Error("Session could not accept a draft");
              return { alreadySaved: false, draft: true };
            },
            stop: async (id) => {
              if (
                removingSessionIds.current.has(id) ||
                switchingWorktrees.current.has(id)
              )
                throw new Error(
                  "Session is being removed or changing worktrees",
                );
              const target = sessionsRef.current.find(
                (session) => session.id === id,
              );
              if (!target) {
                dismissCompletion(id);
                return;
              }
              if (
                target.orchestrationLeadId ||
                !canAccessProject(target.cwd) ||
                isFamiliarSession(id) ||
                isHabitRun(id)
              )
                throw new Error("Session is unavailable in this project");
              await flushSync(() => stopSessionRef.current(id));
              flushHarnessEvents();
              dismissCompletion(id);
            },
            remove: async (id, mode) => {
              const target = await ensureOpenSessionRef.current(id);
              if (
                !target ||
                target.orchestrationLeadId ||
                !canAccessProject(target.cwd) ||
                isFamiliarSession(id) ||
                isHabitRun(id)
              )
                throw new Error("Session is unavailable in this project");
              const removed = await removeSessionRef.current(
                id,
                mode,
                true,
                "cli",
              );
              if (!removed)
                throw new Error(
                  `Session could not be ${mode === "archive" ? "archived" : "deleted"}; another session operation is in progress`,
                );
              dismissCompletion(id);
            },
            worktrees: (cwd) => listWorktrees(cwd),
            createWorktree: (cwd, branch, base, existing) =>
              createWorktree(cwd, branch, base, existing),
            notes: () => invoke("notes_list"),
            note: (id) => invoke("notes_get", { id }),
            saveNote: async (note) => {
              const saved = await upsertNote(note);
              window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
              return saved;
            },
            artifacts: () => invoke("artifacts_list"),
            artifact: getArtifact,
            saveArtifact,
            postArtifact: async (sessionId, card) => {
              const latest = sessionsRef.current.find(
                (session) => session.id === sessionId,
              );
              const anchor =
                sourceTurnId ??
                latest?.blocks
                  .slice()
                  .reverse()
                  .find((block) => block.role === "user")?.id;
              if (
                !latest ||
                !anchor ||
                !latest.blocks.some((block) => block.id === anchor)
              )
                throw new Error(
                  "The artifact's conversation turn is no longer available",
                );
              const updated = recordArtifactCard(latest, anchor, card);
              sessionsRef.current = sessionsRef.current.map((session) =>
                session.id === sessionId ? updated : session,
              );
              setSessions(sessionsRef.current);
              if (!isHabitRun(sessionId)) await upsertSession(updated);
            },
            board: taskBoardRef.current,
            isFamiliar: (id) => isFamiliarSession(id),
            isHabitRun: (id) => isHabitRun(id),
            familiarOf: (id) => {
              const familiar =
                familiarForSession(id) ?? findFamiliar(habitRunFamiliar(id) ?? "");
              return (
                familiar && {
                  id: familiar.id,
                  projects: familiar.projects,
                  showStartedSessionsInSidebar:
                    familiar.showStartedSessionsInSidebar,
                  ...(familiar.useSidebarFolders
                    ? {
                        folder: {
                          name: familiarLook(familiar).name,
                          color: familiar.color,
                        },
                      }
                    : {}),
                }
              );
            },
            habits: { load: loadHabits, update: updateHabits },
            agentFiles: (familiarId) => loadFamiliarFiles(familiarId),
            readAgentFile: (familiarId, path) => readAgentFile(familiarId, path),
            writeAgentFile: (familiarId, path, text, hash) =>
              writeAgentFile(familiarId, path, text, hash),
          },
        );
        appReceipts.current.set(key, { signature, promise });
        void promise.catch(() => {
          if (appReceipts.current.get(key)?.promise === promise)
            appReceipts.current.delete(key);
        });
        if (appReceipts.current.size > 256) {
          const first = appReceipts.current.keys().next().value;
          if (first) appReceipts.current.delete(first);
        }
        return promise;
      };
      void handle()
        .then(
          (result) =>
            invoke("control_reply", {
              id: payload.id,
              response: { ok: true, result },
            }),
          (error: unknown) =>
            invoke("control_reply", {
              id: payload.id,
              response: {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              },
            }),
        )
        .catch(console.error);
    });
    return () => {
      void listening.then((unlisten) => unlisten());
    };
  }, []);

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
  const updateOrchestrationCard = useCallback(
    (leadId: string, blockId: string, proposal: OrchestrationProposal) => {
      const next = sessionsRef.current.map((session) =>
        session.id === leadId
          ? withOrchestrationProposal(session, blockId, proposal)
          : session,
      );
      sessionsRef.current = next;
      setSessions(next);
      return next.find((session) => session.id === leadId);
    },
    [],
  );
  const orchestrationActions = useMemo(
    () => ({
      open: onOpenApprovalSession,
      openAgents: queueWorkerPanes,
      update: (
        leadId: string,
        blockId: string,
        edited: OrchestrationProposal,
      ) => {
        const session = sessionsRef.current.find(
          (entry) => entry.id === leadId,
        );
        const proposal = session?.blocks.find(
          (block) => block.id === blockId,
        )?.orchestration;
        if (
          !session ||
          session.busy ||
          proposal?.status !== "ready" ||
          confirmingOrchestration.current.has(leadId)
        )
          return;
        // Keep the discovered catalog authoritative while allowing task and parallelism edits.
        const settings = validateOrchestrationSettings({
          ...proposal.settings,
          maxWorkers: edited.settings.maxWorkers,
        });
        updateOrchestrationCard(leadId, blockId, {
          ...proposal,
          settings,
          tasks: edited.tasks,
        });
      },
      confirm: async (leadId: string, blockId: string) => {
        if (confirmingOrchestration.current.has(leadId)) return;
        confirmingOrchestration.current.add(leadId);
        let proposal: OrchestrationProposal | undefined;
        try {
          await orchestrator.hydrate(leadId);
          const session = sessionsRef.current.find(
            (entry) => entry.id === leadId,
          );
          proposal = session?.blocks.find(
            (block) => block.id === blockId,
          )?.orchestration;
          if (!session || session.busy || proposal?.status !== "ready")
            throw new Error(
              "Wait for the proposal to finish before confirming.",
            );
          if (
            session.harness !== proposal.author.harness ||
            session.model !== proposal.author.model
          )
            throw new Error(
              "The lead model has changed. Switch back to the model shown on this card, or generate a new proposal.",
            );
          const starting = updateOrchestrationCard(leadId, blockId, {
            ...proposal,
            status: "starting",
          })!;
          // Save the edited card before anything can execute.
          await upsertSession(starting);
          await orchestrator.startApproved(leadId, blockId, proposal);
          updateOrchestrationCard(leadId, blockId, {
            ...proposal,
            status: "approved",
          });
        } catch (error) {
          if (proposal)
            updateOrchestrationCard(leadId, blockId, {
              ...proposal,
              status: "ready",
            });
          throw error;
        } finally {
          confirmingOrchestration.current.delete(leadId);
        }
      },
      retry: (leadId: string, blockId: string) => {
        const session = sessionsRef.current.find(
          (entry) => entry.id === leadId,
        );
        const proposal = session?.blocks.find(
          (block) => block.id === blockId,
        )?.orchestration;
        if (!session || session.busy || !proposal) return;
        onSubmit(leadId, proposal.request, [], {
          intent: "orchestrate",
          orchestrationRetry: proposal,
        });
      },
    }),
    [
      onOpenApprovalSession,
      queueWorkerPanes,
      onSubmit,
      updateOrchestrationCard,
    ],
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

  const orderedTitleTabs: TitleTab[] = orderByIds(
    [
      ...deckProjectTabs.map((tab) =>
        toTitleTab(tab, sessions, dirtyFiles, unseenFinishedIds),
      ),
      ...(insetLayout
        ? openAppViews
            .filter((view) => view !== "notes" || notesEnabled)
            .map((view): TitleTab => ({
              id: appViewTabId(view),
              appView: view,
              project: "",
              title: APP_VIEW_LABELS[view],
              more: [],
              sessionCount: 0,
              harnesses: [],
              busyHarnesses: [],
              files: [],
            }))
        : []),
      ...shownFamiliarTabs.flatMap((familiarId): TitleTab[] => {
        const familiar = findFamiliar(familiarId);
        // Like the sidebar's Familiars, a Familiar's tab shows in the projects it
        // works on; it keeps its place for when the project comes back.
        if (!familiar || !familiarWorksOn(familiar, sidebarCwd)) return [];
        const look = familiarLook(familiar);
        const session = familiar.sessionId
          ? sessions.find((entry) => entry.id === familiar.sessionId)
          : undefined;
        return [
          {
            id: familiarTabId(familiarId),
            familiar: {
              mascot: look.mascot,
              color: look.color,
              status: session ? familiarState(session).status : "idle",
            },
            project: "",
            title: look.name,
            more: [],
            sessionCount: 0,
            harnesses: [],
            busyHarnesses: [],
            files: [],
          },
        ];
      }),
    ],
    insetLayout ? titleTabOrder : [],
  );
  // Like a browser, a Familiar or app tab can be the only tab. The project's lone
  // blank session tab stays underneath, out of the strip, until closing the
  // last of them shows it again.
  const shownViewTabId = settingsOpen
    ? undefined
    : familiarCovers
      ? familiarViewTabId
      : activeAppView
        ? appViewTabId(activeAppView)
        : undefined;
  const placeholderTab =
    insetLayout &&
    shownViewTabId &&
    orderedTitleTabs.some((tab) => tab.id === shownViewTabId) &&
    deckProjectTabs.length === 1 &&
    isBlankWorkspaceTab(deckProjectTabs[0], sessions)
      ? deckProjectTabs[0].id
      : undefined;
  const nextTitleTabs = placeholderTab
    ? orderedTitleTabs.filter((tab) => tab.id !== placeholderTab)
    : orderedTitleTabs;
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

  const onToggleSessionSidebar = useCallback(() => {
    setSessionSidebarOpen((open) => {
      const next = !open;
      saveSessionSidebarOpen(next);
      return next;
    });
  }, []);

  // The inset layout has no project rail, so its sidebar takes the primary
  // toggle.
  const onToggleSidebar = useCallback(() => {
    if (insetLayout) {
      onToggleSessionSidebar();
      return;
    }
    setProjectRailOpen((open) => {
      const next = !open;
      saveProjectRailOpen(next);
      return next;
    });
  }, [insetLayout, onToggleSessionSidebar]);

  // The inset layout's sidebar already answers the primary toggle, so the
  // session sidebar's shortcut takes the right panel instead.
  const rightPanelToggleRef = useRef<(() => void) | null>(null);
  const onToggleSessionSidebarShortcut = useCallback(() => {
    if (insetLayout) {
      rightPanelToggleRef.current?.();
      return;
    }
    onToggleSessionSidebar();
  }, [insetLayout, onToggleSessionSidebar]);

  const onToggleProjectRail = useCallback(() => {
    setProjectRailOpen((open) => {
      const next = !open;
      saveProjectRailOpen(next);
      return next;
    });
  }, []);

  const onGoToFile = useCallback(() => {
    setSearchViewOpen(false);
    setInboxViewOpen(false);
    setNotesViewOpen(false);
    setAutomationsViewOpen(false);
    setFilePickerInitialQuery("");
    setFilePickerResetToken((token) => token + 1);
    setFilePickerOpen(true);
  }, []);
  const onOpenCommandPalette = useCallback(() => {
    setSearchViewOpen(false);
    setInboxViewOpen(false);
    setNotesViewOpen(false);
    setAutomationsViewOpen(false);
    setFilePickerInitialQuery(">");
    setFilePickerResetToken((token) => token + 1);
    setFilePickerOpen(true);
  }, []);
  const onReload = useCallback(() => {
    void (async () => {
      if (!(await confirmReload(dirtyFilesRef.current.size > 0))) return;
      window.location.reload();
    })();
  }, []);

  const onFindInProject = useCallback(() => {
    setSearchViewOpen(false);
    setInboxViewOpen(false);
    setNotesViewOpen(false);
    setAutomationsViewOpen(false);
    setSidebarTab("files");
    setFilesSearchOpen(true);
    setSearchFocusToken((token) => token + 1);
  }, []);

  const onOpenSearch = useCallback(() => {
    workspaceNavigation.cancel();
    startTransition(() => {
      // With the Familiar closed in the same commit, no frame shows the
      // workspace tab between the two views.
      closeFamiliarView();
      rememberAppView("search");
      setFilePickerOpen(false);
      setSettingsOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsViewOpen(false);
      setSearchViewOpen(true);
      setSearchViewFocusToken((token) => token + 1);
    });
  }, []);

  const onLeaveSearch = useCallback(() => {
    setSearchViewOpen(false);
  }, []);

  const onOpenInbox = useCallback(() => {
    workspaceNavigation.cancel();
    startTransition(() => {
      closeFamiliarView();
      rememberAppView("inbox");
      setFilePickerOpen(false);
      setSettingsOpen(false);
      setSearchViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsViewOpen(false);
      setInboxViewOpen(true);
    });
  }, []);

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

  const onOpenNotes = useCallback(() => {
    workspaceNavigation.cancel();
    if (!loadNotesEnabled()) return;
    startTransition(() => {
      closeFamiliarView();
      rememberAppView("notes");
      setFilePickerOpen(false);
      setSettingsOpen(false);
      setSearchViewOpen(false);
      setInboxViewOpen(false);
      setAutomationsViewOpen(false);
      setNotesViewOpen(true);
    });
  }, []);

  const onLeaveNotes = useCallback(() => {
    setNotesViewOpen(false);
  }, []);

  const onOpenAutomations = useCallback(() => {
    workspaceNavigation.cancel();
    startTransition(() => {
      closeFamiliarView();
      rememberAppView("automations");
      setFilePickerOpen(false);
      setSettingsOpen(false);
      setSearchViewOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsViewOpen(true);
    });
  }, []);

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
    async (sessionId: string) => {
      const session = await ensureOpenSession(sessionId);
      if (!session)
        throw new Error("This conversation is no longer available.");
      setAutomationsViewOpen(false);
      setSearchViewOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setSettingsOpen(false);
      setFilePickerOpen(false);
      setSidebarTab("sessions", session.cwd);
      setProjectCwd(session.cwd);
      setRecents(rememberProject(session.cwd));
      await onSelectHistorySession(sessionId);
    },
    [ensureOpenSession, onSelectHistorySession],
  );

  const openSettings = useCallback(
    (section?: SettingsSectionId, anchor?: SettingsAnchor) => {
      workspaceNavigation.cancel();
      settingsReturnViewRef.current = captureSettingsReturnView(
        settingsReturnViewRef.current,
        {
          search: searchViewOpenRef.current,
          inbox: inboxViewOpenRef.current,
          notes: notesViewOpenRef.current,
          automations: automationsSurfaceOpenRef.current,
          localSurface: localSurfaceRef.current,
        },
        settingsOpenRef.current,
      );
      startTransition(() => {
        setFilePickerOpen(false);
        setSearchViewOpen(false);
        setInboxViewOpen(false);
        setNotesViewOpen(false);
        setAutomationsViewOpen(false);
        if (section) {
          setSettingsSection(section);
          saveSettingsSection(section);
        }
        setSettingsAnchor(anchor ?? null);
        setNotificationProjectPath(null);
        setSettingsOpen(true);
      });
    },
    [],
  );

  const onOpenSettings = useCallback(() => openSettings(), [openSettings]);
  useEffect(() => {
    const openConnections = () => openSettings("connections");
    window.addEventListener(OPEN_CONNECTIONS_EVENT, openConnections);
    return () =>
      window.removeEventListener(OPEN_CONNECTIONS_EVENT, openConnections);
  }, [openSettings]);
  const remoteProjectDialogOpen = useWorkspaceField(workspaceStore, "remoteProjectDialogOpen");
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
    (path?: string) => {
      openSettings("inbox", "project-notifications");
      setNotificationProjectPath(path ?? null);
      setNotificationSettingsRequest((request) => request + 1);
    },
    [openSettings],
  );

  const onOpenInboxIntegrations = useCallback(
    (source: ConnectableInboxSource) => openSettings("inbox", source),
    [openSettings],
  );

  const onCloseSettings = useCallback(() => {
    const returnView = restoreSettingsReturnView(
      settingsReturnViewRef.current,
      loadNotesEnabled(),
      loadRailSurfaces(),
    );
    setSearchViewOpen(returnView.search);
    setInboxViewOpen(returnView.inbox);
    setNotesViewOpen(returnView.notes);
    setAutomationsSurfaceOpen(returnView.automations);
    setLocalSurface(returnView.localSurface);
    setSettingsOpen(false);
  }, []);

  const onSelectSettingsSection = useCallback((section: SettingsSectionId) => {
    setSettingsSection(section);
    saveSettingsSection(section);
  }, []);

  const onOpenArchivedSession = useCallback(
    (sessionId: string) => {
      setSettingsOpen(false);
      void onSelectHistorySession(sessionId);
    },
    [onSelectHistorySession],
  );

  const onRailBack = useCallback(() => {
    if (settingsOpen) {
      onCloseSettings();
      return;
    }
    if (searchViewOpen) {
      setSearchViewOpen(false);
      return;
    }
    if (inboxViewOpen) {
      setInboxViewOpen(false);
      return;
    }
    if (notesViewOpen) {
      setNotesViewOpen(false);
      return;
    }
    if (automationsViewOpen) {
      setAutomationsViewOpen(false);
      return;
    }
    if (workspaceStore.getState().familiarViewId) {
      closeFamiliarView();
      setComposerFocused(true);
      return;
    }
    onVisitBack();
  }, [
    onCloseSettings,
    onVisitBack,
    closeFamiliarView,
    searchViewOpen,
    settingsOpen,
    inboxViewOpen,
    notesViewOpen,
    automationsViewOpen,
  ]);

  const onRailForward = useCallback(() => {
    setSearchViewOpen(false);
    setSettingsOpen(false);
    setInboxViewOpen(false);
    setNotesViewOpen(false);
    setAutomationsViewOpen(false);
    onVisitForward();
  }, [onVisitForward]);

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
    (delta: number, inCurrentTab = false) => {
      const activeWorkspace = tabsRef.current.find(
        (entry) => entry.id === activeTabIdRef.current,
      );
      if (!activeWorkspace || activeWorkspace.diffFocused) return;
      const current = sessionsRef.current.find(
        (session) => session.id === activeWorkspace.focusedId,
      );
      if (!current) return;
      const remoteProject = isRemoteProjectPath(current.cwd);
      const navigationId = remoteProject
        ? remoteSessionFor(current.id)
        : current.id;
      if (!navigationId) return;

      const next = adjacentItemId(
        sessionNavigationIdsRef.current,
        navigationId,
        delta,
      );
      if (!next || next === navigationId) return;
      if (remoteProject) {
        if (inCurrentTab) {
          rememberRemoteSession(current.id, next);
          setComposerFocused(true);
        } else {
          onSelectRemoteSession(current.cwd, next);
        }
        return;
      }
      // Stepping gives no hover to warm the transcript, so load the one a
      // further step away once this switch has its own session.
      const prefetchAhead = () => {
        const ahead = adjacentItemId(
          sessionNavigationIdsRef.current,
          next,
          delta,
        );
        if (ahead && ahead !== current.id) onPrefetchHistorySession(ahead);
      };
      if (!inCurrentTab) {
        void onSelectHistorySession(next).then(prefetchAhead);
        return;
      }
      const activeTabId = activeWorkspace.id;
      const focusedId = current.id;
      void ensureOpenSession(next).then((session) => {
        prefetchAhead();
        if (!session || session.inboxAsk) return;
        if (activeTabIdRef.current !== activeTabId) return;
        const currentTab = tabsRef.current.find(
          (tab) => tab.id === activeTabId,
        );
        if (currentTab?.focusedId !== focusedId) return;
        setTabs(
          (prev) =>
            switchSessionInTab(prev, activeTabId, focusedId, next) ?? prev,
        );
        setComposerFocused(true);
        const linkedUpdate = linkedSessionUpdatesRef.current.get(next);
        if (linkedUpdate) revealLinkedSessionUpdate(next, linkedUpdate);
      });
    },
    [
      ensureOpenSession,
      onPrefetchHistorySession,
      onSelectHistorySession,
      onSelectRemoteSession,
      revealLinkedSessionUpdate,
    ],
  );

  const onNavigateProjectList = useCallback(
    (delta: number) => {
      const current = normalizeProjectPath(projectCwdRef.current);
      const ids = projectRailItems(loadRecents(), current).map(
        (project) => project.path,
      );
      const next = adjacentItemId(ids, current, delta);
      if (!next || sameProjectPath(next, current)) return;
      noteProjectStep(next, delta);
      onSelectProject(next);
    },
    [onSelectProject],
  );

  const onOpenBoardCard = useCallback(
    (cardId: string) => {
      requestBoardFocus(cardId);
      onOpenLocalSurface("board");
    },
    [onOpenLocalSurface],
  );
  const onOpenUsageSurface = useCallback(
    () => onOpenLocalSurface("usage"),
    [onOpenLocalSurface],
  );
  const onSelectTitleTab = useCallback(
    (id: string) => {
      const familiarId = familiarForTab(id);
      if (familiarId) {
        void onOpenFamiliar(familiarId);
        return;
      }
      const view = appViewForTab(id);
      if (view) {
        const open = {
          search: onOpenSearch,
          inbox: onOpenInbox,
          notes: onOpenNotes,
          automations: onOpenAutomations,
        };
        open[view]();
        return;
      }
      setSearchViewOpen(false);
      setSettingsOpen(false);
      setInboxViewOpen(false);
      setNotesViewOpen(false);
      setAutomationsViewOpen(false);
      activateTab(id);
    },
    [
      activateTab,
      onOpenFamiliar,
      onOpenSearch,
      onOpenInbox,
      onOpenNotes,
      onOpenAutomations,
    ],
  );

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

  const onCloseAppView = useCallback((view: AppView, selectNeighbor = true) => {
    const navigation = displayedTabNavigation.current;
    const nextId = selectNeighbor
      ? nextDisplayedTabAfterClose(
          navigation.tabs,
          navigation.activeId,
          appViewTabId(view),
        )
      : undefined;
    startTransition(() => {
      setOpenAppViews((current) => current.filter((entry) => entry !== view));
      setTitleTabOrder((current) =>
        current.filter((id) => id !== appViewTabId(view)),
      );
      if (view === "search") setSearchViewOpen(false);
      if (view === "inbox") setInboxViewOpen(false);
      if (view === "notes") setNotesViewOpen(false);
      if (view === "automations") setAutomationsViewOpen(false);
      if (nextId) navigation.select?.(nextId);
    });
  }, []);
  /** Closing a Familiar's tab puts its view away when it is the one shown. */
  const onCloseFamiliarTab = useCallback(
    (familiarId: string, selectNeighbor = true) => {
      const navigation = displayedTabNavigation.current;
      const id = familiarTabId(familiarId);
      const showing = navigation.activeId === id;
      const nextId =
        selectNeighbor && showing
          ? nextDisplayedTabAfterClose(navigation.tabs, navigation.activeId, id)
          : undefined;
      startTransition(() => {
        setOpenFamiliarTabs((current) =>
          current.filter((entry) => entry !== familiarId),
        );
        setTitleTabOrder((current) => current.filter((entry) => entry !== id));
        if (nextId) navigation.select?.(nextId);
        else if (showing) closeFamiliarView();
      });
    },
    [closeFamiliarView],
  );
  const closeViewTab = useCallback(
    (id: string, selectNeighbor?: boolean) => {
      const view = appViewForTab(id);
      if (view) onCloseAppView(view, selectNeighbor);
      const familiarId = familiarForTab(id);
      if (familiarId) onCloseFamiliarTab(familiarId, selectNeighbor);
    },
    [onCloseAppView, onCloseFamiliarTab],
  );
  const onCloseDisplayedTab = useCallback(
    (id: string) => {
      if (isViewTab(id)) closeViewTab(id);
      else onCloseTitleTab(id);
    },
    [closeViewTab, onCloseTitleTab],
  );
  const onCloseDisplayedTabs = useCallback(
    (ids: string[], fallbackId: string) => {
      const navigation = displayedTabNavigation.current;
      const closing = new Set(ids);
      const workspaceIds = ids.filter((id) => !isViewTab(id));
      startTransition(() => {
        for (const id of ids) {
          if (isViewTab(id)) closeViewTab(id, false);
        }
        if (workspaceIds.length > 0) {
          // Kept from a view tab, the workspace beneath falls back to one of
          // this project's shown tabs that stays open; with none left, Close
          // All keeps a blank one rather than reaching into another project.
          const workspaceFallback = isViewTab(fallbackId)
            ? [
                activeTabIdRef.current,
                ...navigation.tabs.map((tab) => tab.id),
              ].find(
                (id) =>
                  !closing.has(id) &&
                  !isViewTab(id) &&
                  navigation.tabs.some((tab) => tab.id === id),
              )
            : fallbackId;
          if (workspaceFallback) onCloseTabs(workspaceIds, workspaceFallback);
          else onCloseEveryTab(workspaceIds);
        }
        if (closing.has(navigation.activeId)) navigation.select?.(fallbackId);
      });
    },
    [closeViewTab, onCloseTabs, onCloseEveryTab],
  );
  const onCloseAllDisplayedTabs = useCallback(
    (ids: readonly string[]) => {
      startTransition(() => {
        for (const id of ids) {
          if (isViewTab(id)) closeViewTab(id, false);
        }
        onCloseEveryTab(ids.filter((id) => !isViewTab(id)));
      });
    },
    [closeViewTab, onCloseEveryTab],
  );
  const onReorderDisplayedTabs = useCallback(
    (ids: string[], movedId?: string) => {
      setTitleTabOrder((current) =>
        mergeOrderedSubset(
          current.map((id) => ({ id })),
          ids.map((id) => ({ id })),
        ).map((tab) => tab.id),
      );
      onReorderTabs(
        ids.filter((id) => !isViewTab(id)),
        isViewTab(movedId ?? "") ? undefined : movedId,
      );
    },
    [onReorderTabs],
  );
  const onCloseVisibleTab = useCallback(() => {
    if (insetLayout && familiarCovers && familiarViewTabId) closeViewTab(familiarViewTabId);
    else if (insetLayout && activeAppView) onCloseAppView(activeAppView);
    else onCloseFocused();
  }, [
    insetLayout,
    familiarCovers,
    familiarViewTabId,
    activeAppView,
    closeViewTab,
    onCloseAppView,
    onCloseFocused,
  ]);
  const onCycleVisibleTab = useCallback(
    (delta: number) => {
      if (!insetLayout) {
        (delta > 0 ? onNext : onPrev)();
        return;
      }
      const current =
        familiarCovers && familiarViewTabId
          ? familiarViewTabId
          : activeAppView
            ? appViewTabId(activeAppView)
            : activeTabId;
      const index = titleTabs.findIndex((tab) => tab.id === current);
      const next =
        titleTabs[(index + delta + titleTabs.length) % titleTabs.length];
      if (next) onSelectTitleTab(next.id);
    },
    [
      insetLayout,
      familiarCovers,
      familiarViewTabId,
      activeAppView,
      activeTabId,
      titleTabs,
      onSelectTitleTab,
      onNext,
      onPrev,
    ],
  );
  const onActivateVisibleTab = useCallback(
    (slot: number) => {
      if (!insetLayout) {
        onActivate(slot);
        return;
      }
      const tab = slot < 0 ? titleTabs[titleTabs.length - 1] : titleTabs[slot];
      if (tab) onSelectTitleTab(tab.id);
    },
    [insetLayout, titleTabs, onSelectTitleTab, onActivate],
  );

  // The inset layout's shortcuts close every kind of title tab, like its
  // tab menu.
  const onCloseOtherVisibleTabs = useCallback(() => {
    if (!insetLayout) {
      onCloseOtherTabs();
      return;
    }
    const { tabs: shown, activeId } = displayedTabNavigation.current;
    if (!shown.some((tab) => tab.id === activeId)) return;
    onCloseDisplayedTabs(
      shown.filter((tab) => tab.id !== activeId).map((tab) => tab.id),
      activeId,
    );
  }, [insetLayout, onCloseOtherTabs, onCloseDisplayedTabs]);
  const onCloseAllVisibleTabs = useCallback(() => {
    if (!insetLayout) {
      onCloseAllTabs();
      return;
    }
    onCloseAllDisplayedTabs(
      displayedTabNavigation.current.tabs.map((tab) => tab.id),
    );
  }, [insetLayout, onCloseAllTabs, onCloseAllDisplayedTabs]);

  const actions = useRef({
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
  actions.current = {
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
  };

  const debounce = useRef({ name: "", at: 0 });
  const run = useCallback((name: string, fn: () => void) => {
    const now = performance.now();
    if (name === debounce.current.name && now - debounce.current.at < 80)
      return;
    debounce.current = { name, at: now };
    fn();
  }, []);

  useEffect(() => {
    if (!IS_MAC) return;
    void invoke("autosave_set_enabled", { enabled: loadAutosave() }).catch(
      console.error,
    );
    void invoke("keybindings_set_overrides", {
      overrides: loadKeybindingOverrides(),
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The Quick Composer recorder owns the next key combination, including
      // bindings that the workspace would normally handle in capture phase.
      // It records only while focused, so check the focused element: a
      // document-wide query walked the whole DOM on every keystroke.
      if (
        document.activeElement?.getAttribute(
          "data-shortcut-recorder-active",
        ) === "true"
      )
        return;
      // Never act on a chord while an IME is composing: tabCommand and the
      // editor guards already do, and the app shortcut resolver does too, so
      // this keeps the whole handler consistent for whatever is added next.
      if (e.isComposing) return;
      const customCommand = matchCustomKeybinding(e);
      const pressed = (command: string, defaultMatch: boolean) =>
        keybindingPressed(command, e, defaultMatch);
      // A rebound zoom chord may be Option-only, so it is resolved outside the
      // Cmd/Ctrl guard that only the browser-standard defaults need.
      const zoom = resolveZoomKeybinding(e);
      // An image preview under the pointer zooms the image instead; its own
      // listener runs next.
      if (zoom && document.querySelector("[data-image-zoom]")) return;
      if (zoom) {
        e.preventDefault();
        e.stopPropagation();
        if (zoom === "zoom-in") {
          const next = saveUiScale(zoomInUiScale(loadUiScale()));
          void applyUiScale(next);
        } else if (zoom === "zoom-out") {
          const next = saveUiScale(zoomOutUiScale(loadUiScale()));
          void applyUiScale(next);
        } else {
          saveUiScale(UI_SCALE_DEFAULT);
          void applyUiScale(UI_SCALE_DEFAULT);
        }
        return;
      }
      const cmd = customCommand
        ? tabCommandForKeybinding(customCommand, e)
        : tabCommand(e);
      if (cmd && pressed(tabCommandKeybinding(cmd), !customCommand)) {
        if (cmd === "archive-session") {
          if (e.repeat) return;
          actions.current.onArchiveFocusedSession(e);
          return;
        }
        const target = e.target instanceof Element ? e.target : null;
        const listNavigation =
          cmd === "prev-session" ||
          cmd === "next-session" ||
          cmd === "prev-session-in-tab" ||
          cmd === "next-session-in-tab" ||
          cmd === "prev-project" ||
          cmd === "next-project";
        if (listNavigation) {
          const blockedTarget = Boolean(
            target?.closest(
              'input, textarea, select, [contenteditable="true"], .cm-editor, .molfar-terminal, [role="dialog"], [data-model-picker], [data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-app-search]',
            ),
          );
          const emptyComposerTarget = Boolean(
            target?.matches('textarea[data-composer-empty="true"]'),
          );
          const surfaceOpen =
            searchViewOpenRef.current ||
            inboxViewOpenRef.current ||
            notesViewOpenRef.current ||
            automationsViewOpenRef.current ||
            settingsOpenRef.current ||
            filePickerOpenRef.current ||
            Boolean(whatsNewVersionRef.current) ||
            Boolean(getUpdatePrompt()) ||
            Boolean(getAppDialog());
          if (
            !shouldHandleListNavigation({
              blockedTarget,
              emptyComposerTarget,
              surfaceOpen,
            })
          ) {
            return;
          }
        }
        if (
          target?.closest(".molfar-terminal") &&
          e.ctrlKey &&
          !e.metaKey &&
          (cmd === "back" ||
            cmd === "forward" ||
            /Mac|iPhone|iPad/.test(navigator.platform))
        ) {
          return;
        }
        if (
          (cmd === "split-right" || cmd === "split-down") &&
          target?.closest(".cm-editor")
        ) {
          return;
        }
        const inPicker =
          target &&
          target.closest(
            "[data-model-picker], [data-file-picker], [data-branch-picker], [data-skill-picker], [data-mention-picker], [data-app-search]",
          );
        if (
          inPicker &&
          typeof cmd === "object" &&
          "activate" in cmd &&
          !(insetLayoutRef.current && target?.closest("[data-app-search]"))
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const a = actions.current;
        if (cmd === "new") run("new", a.onNewFocused);
        else if (cmd === "close-others")
          run("close-others", a.onCloseOtherTabs);
        else if (cmd === "close-all") run("close-all", a.onCloseAllTabs);
        else if (cmd === "close") run("close", a.onCloseFocused);
        else if (cmd === "next") run("next", a.onNext);
        else if (cmd === "prev") run("prev", a.onPrev);
        else if (cmd === "cycle-next") run("next", a.onNext);
        else if (cmd === "cycle-prev") run("prev", a.onPrev);
        else if (cmd === "back") run("back", a.onVisitBack);
        else if (cmd === "forward") run("forward", a.onVisitForward);
        else if (cmd === "split-right")
          run("split-right", () => a.onSplit("right"));
        else if (cmd === "split-down")
          run("split-down", () => a.onSplit("down"));
        else if (cmd === "new-terminal") run("new-terminal", a.onNewTerminal);
        else if (cmd === "new-terminal-tab")
          run("new-terminal-tab", a.onNewTerminalTab);
        else if (cmd === "toggle-terminal")
          run("toggle-terminal", a.onToggleProjectTerminal);
        else if (cmd === "prev-session")
          run("prev-session", () => a.onNavigateSessionList(-1));
        else if (cmd === "next-session")
          run("next-session", () => a.onNavigateSessionList(1));
        else if (cmd === "prev-session-in-tab")
          run("prev-session-in-tab", () => a.onNavigateSessionList(-1, true));
        else if (cmd === "next-session-in-tab")
          run("next-session-in-tab", () => a.onNavigateSessionList(1, true));
        else if (cmd === "prev-project")
          run("prev-project", () => a.onNavigateProjectList(-1));
        else if (cmd === "next-project")
          run("next-project", () => a.onNavigateProjectList(1));
        else if (typeof cmd === "object" && "focus" in cmd)
          run(`focus-${cmd.focus}`, () => a.onFocusDir(cmd.focus));
        else if (typeof cmd === "object" && "activate" in cmd)
          run(`activate-${cmd.activate}`, () => a.onActivate(cmd.activate));
        return;
      }
      if (
        !searchViewOpenRef.current &&
        !inboxViewOpenRef.current &&
        !notesViewOpenRef.current &&
        !automationsViewOpenRef.current &&
        !(
          e.target instanceof Element &&
          e.target.closest("[data-session-drop], [data-agent-tab]")
        ) &&
        handleEditorFindKey(e)
      ) {
        e.stopPropagation();
        return;
      }
      const shortcut = resolveAppShortcut(e);
      if (shortcut) {
        if (
          shortcut === "App: Search" &&
          e.target instanceof Element &&
          e.target.closest(".molfar-terminal") &&
          e.ctrlKey &&
          !e.metaKey
        ) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        const a = actions.current;
        if (shortcut === "App: New Window")
          run("new_window", () => void invoke("open_new_window"));
        else if (shortcut === "App: Open Project")
          run("open_project", () => void a.pickProject());
        else if (shortcut === "App: Toggle Sidebar")
          run("toggle_sidebar", a.onToggleSidebar);
        else if (shortcut === "App: Toggle Session Sidebar")
          run("toggle_session_sidebar", a.onToggleSessionSidebar);
        else if (shortcut === "App: Toggle Familiar")
          run("toggle_familiar", a.onToggleFamiliar);
        else if (shortcut === "App: Go to File")
          run("go_to_file", a.onGoToFile);
        else if (shortcut === "App: Command Palette")
          run("open_command_palette", a.onOpenCommandPalette);
        else if (shortcut === "View: Reload") run("reload", a.onReload);
        else if (shortcut === "App: Search") run("open_search", a.onOpenSearch);
        else if (shortcut === "App: Settings")
          run("open_settings", () => a.openSettings());
        else if (shortcut === "App: Find in Files")
          run("find_in_project", a.onFindInProject);
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [run]);

  useEffect(() => {
    const unlisten: Array<Promise<() => void>> = [
      listen("new_tab", () => run("new", actions.current.onNewFocused)),
      listen("close_other_tabs", () =>
        run("close-others", actions.current.onCloseOtherTabs),
      ),
      listen("close_all_tabs", () =>
        run("close-all", actions.current.onCloseAllTabs),
      ),
      listen("close_tab", () => run("close", actions.current.onCloseFocused)),
      listen<boolean>("toggle_autosave", ({ payload }) => {
        const saved = saveAutosave(payload);
        if (saved !== payload && IS_MAC) {
          void invoke("autosave_set_enabled", { enabled: saved });
        }
      }),
      listen("next_tab", () => run("next", actions.current.onNext)),
      listen("prev_tab", () => run("prev", actions.current.onPrev)),
      listen("back_tab", () => run("back", actions.current.onVisitBack)),
      listen("forward_tab", () =>
        run("forward", actions.current.onVisitForward),
      ),
      listen("split_right", () =>
        run("split-right", () => actions.current.onSplit("right")),
      ),
      listen("split_down", () =>
        run("split-down", () => actions.current.onSplit("down")),
      ),
      listen("new_terminal", () =>
        run("new-terminal", actions.current.onNewTerminal),
      ),
      listen("new_terminal_tab", () =>
        run("new-terminal-tab", actions.current.onNewTerminalTab),
      ),
      listen("toggle_terminal", () =>
        run("toggle-terminal", actions.current.onToggleProjectTerminal),
      ),
      listen("focus_left", () =>
        run("focus-left", () => actions.current.onFocusDir("left")),
      ),
      listen("focus_right", () =>
        run("focus-right", () => actions.current.onFocusDir("right")),
      ),
      listen("focus_up", () =>
        run("focus-up", () => actions.current.onFocusDir("up")),
      ),
      listen("focus_down", () =>
        run("focus-down", () => actions.current.onFocusDir("down")),
      ),
      listen("toggle_sidebar", () =>
        run("toggle_sidebar", actions.current.onToggleSidebar),
      ),
      listen("toggle_session_sidebar", () =>
        run("toggle_session_sidebar", actions.current.onToggleSessionSidebar),
      ),
      listen("open_project", () => {
        void actions.current.pickProject();
      }),
      listen("go_to_file", () => run("go_to_file", actions.current.onGoToFile)),
      listen("open_command_palette", () =>
        run("open_command_palette", actions.current.onOpenCommandPalette),
      ),
      listen("reload", () => run("reload", actions.current.onReload)),
      listen("open_search", () => actions.current.onOpenSearch()),
      listen("open_inbox", () => actions.current.onOpenInbox()),
      listen("open_notes", () => actions.current.onOpenNotes()),
      listen("open_settings", () => actions.current.openSettings()),
      listen("check_for_updates", () => {
        void runUpdateFlow(true);
      }),
      listen("sidebar_opacity", () => {
        actions.current.openSettings("appearance");
      }),
      listen("find_in_project", () => actions.current.onFindInProject()),
      listen("find", () => {
        openFindInActiveEditor();
      }),
      listen("open_model_picker", () => {
        window.dispatchEvent(new Event("open_model_picker"));
      }),
      // Every window hears the click; only the one holding the session acts.
      listen<string>(NOTIFICATION_CLICK_EVENT, ({ payload: sessionId }) => {
        const boardCard = boardNoticeCard(sessionId);
        const handled = boardCard
          ? isMainWindow
          : sessionsRef.current.some((s) => s.id === sessionId);
        if (!handled) return;
        const win = getCurrentWindow();
        // Windows leaves a minimized window minimized when it is only focused.
        void win
          .unminimize()
          .then(() => win.setFocus())
          .catch(() => {});
        if (boardCard) actions.current.onOpenBoardCard(boardCard);
        else actions.current.onOpenApprovalSession(sessionId);
      }),
      listen("zoom_in", () => {
        const next = zoomInUiScale(loadUiScale());
        saveUiScale(next);
        void applyUiScale(next);
      }),
      listen("zoom_out", () => {
        const next = zoomOutUiScale(loadUiScale());
        saveUiScale(next);
        void applyUiScale(next);
      }),
      listen("zoom_reset", () => {
        saveUiScale(UI_SCALE_DEFAULT);
        void applyUiScale(UI_SCALE_DEFAULT);
      }),
    ];
    return () => {
      void Promise.all(unlisten).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [run]);

  const dockGridRef = useRef<HTMLDivElement>(null);
  const dockDragSize = useRef<number | null>(null);
  const paintDockSize = useCallback((size: number) => {
    const dock = findProjectTerminal(
      projectTerminalsRef.current,
      projectCwdRef.current,
    );
    const el = dockGridRef.current;
    if (!dock || !el || workspaceStore.getState().familiarViewId) return;
    dockDragSize.current = size;
    applyDockGridStyle(el, dock.side, size);
  }, []);
  const commitDockSize = useCallback(
    (size: number) => {
      dockDragSize.current = null;
      onProjectTerminalSize(size);
    },
    [onProjectTerminalSize],
  );
  const dockWasOpen = useRef<{ path: string; open: boolean } | null>(null);
  const dockAnimation = useRef<{ key: string; stop: () => void } | null>(
    null,
  );
  // The project whose dock stays rendered while it slides shut.
  const [dockClosing, setDockClosing] = useState<string | null>(null);
  const dockClosingShown =
    dockClosing != null &&
    !familiarCovers &&
    !!currentProjectDock &&
    !currentProjectDock.open &&
    sameProjectPath(dockClosing, projectCwd);
  useLayoutEffect(() => {
    if (familiarCovers) dockDragSize.current = null;
    if (dockDragSize.current != null) return;
    const el = dockGridRef.current;
    if (!el) return;
    const dock = currentProjectDock;
    const open = dockVisible && !familiarCovers && !!dock;
    const side = dock && (open || dockClosingShown) ? dock.side : null;
    const size = dock?.size ?? 0;
    // Only a dock opening or closing in place slides; a project switch or a
    // familiar covering the workspace shows or hides it at once.
    const previous = dockWasOpen.current;
    const inPlace = !!previous && sameProjectPath(previous.path, projectCwd);
    dockWasOpen.current = { path: projectCwd, open };
    const key = side ? `${open ? "open" : "close"}:${side}:${size}` : "";
    // Unrelated dock updates, like a terminal retitling itself, leave a
    // running slide alone.
    if (inPlace && dockAnimation.current?.key === key) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animates =
      insetLayout && !reduceMotion && typeof el.animate === "function";
    // Render the dock once more so it can slide out; the grid keeps its
    // track until then.
    if (
      animates &&
      inPlace &&
      previous.open &&
      !open &&
      dock &&
      !familiarCovers
    ) {
      setDockClosing(projectCwd);
      return;
    }
    const host = el.querySelector<HTMLElement>(":scope > [data-dock-shown]");
    const vertical = side ? isVerticalDock(side) : true;
    // A reversal mid-slide starts from wherever the track currently is.
    const current = host
      ? vertical
        ? host.getBoundingClientRect().height
        : host.getBoundingClientRect().width
      : 0;
    const reversing = !!dockAnimation.current;
    dockAnimation.current?.stop();
    dockAnimation.current = null;
    applyDockGridStyle(el, side, size);
    const opening = open && inPlace && (!previous.open || reversing);
    const closing = !open && !!side;
    if (!side || !animates || !(opening || closing)) return;
    const section = host?.firstElementChild;
    if (!host || !(section instanceof HTMLElement)) return;
    // The terminal keeps its full size and rides the moving edge, so it fits
    // once instead of on every frame.
    const property = vertical ? "gridTemplateRows" : "gridTemplateColumns";
    const leading = side === "top" || side === "left";
    host.style.display = "flex";
    host.style.flexDirection = vertical ? "column" : "row";
    host.style.justifyContent = leading ? "flex-end" : "flex-start";
    section.style.flexShrink = "0";
    if (vertical) section.style.height = `${size}px`;
    else section.style.width = `${size}px`;
    const track = (px: number) =>
      leading ? `${px}px minmax(0, 1fr)` : `minmax(0, 1fr) ${px}px`;
    const from = reversing ? current : opening ? 0 : size;
    const endTransition = beginLayoutTransition();
    const animation = el.animate(
      [{ [property]: track(from) }, { [property]: track(opening ? size : 0) }],
      {
        duration: opening ? 240 : 200,
        easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        fill: "forwards",
      },
    );
    // Mounting the terminal can hold up the next frame; the slide starts
    // once that frame is out, not partway through.
    animation.pause();
    const start = requestAnimationFrame(() => animation.play());
    const stop = () => {
      cancelAnimationFrame(start);
      animation.onfinish = null;
      animation.cancel();
      host.style.display = "";
      host.style.flexDirection = "";
      host.style.justifyContent = "";
      section.style.flexShrink = "";
      section.style.height = "";
      section.style.width = "";
      endTransition();
      if (dockAnimation.current?.stop === stop) dockAnimation.current = null;
      if (closing) setDockClosing(null);
    };
    // A closed dock holds its last frame until it is no longer rendered.
    animation.onfinish = opening ? stop : () => setDockClosing(null);
    dockAnimation.current = { key, stop };
  }, [
    currentProjectDock,
    dockVisible,
    dockClosingShown,
    familiarCovers,
    insetLayout,
    projectCwd,
  ]);
  useEffect(() => () => dockAnimation.current?.stop(), []);

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

  const sessionPaneProps = {
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
  const selectedFamiliarActivity = familiarOverview.selectedActivity;
  const familiarActivityView =
    familiarViewSession && selectedFamiliarActivity ? (
      <FamiliarActivityView
        key={selectedFamiliarActivity.turnId}
        blocks={selectedFamiliarActivity.blocks}
        live={selectedFamiliarActivity.live}
        cwd={sessionWorkCwd(familiarViewSession)}
        onApproval={
          familiarViewSession.worktreeRemoved
            ? undefined
            : (requestId, decision) =>
                onApproval(familiarViewSession.id, requestId, decision)
        }
        onOpenFile={onOpenFile}
        onOpenDiff={onOpenDiff}
      />
    ) : null;
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
      <FamiliarOverview
        key={familiarViewFamiliar.id}
        open={familiarOverviewOpen}
        familiarId={familiarViewFamiliar.id}
        cwd={familiarViewSession.cwd}
        agent={familiarLook(familiarViewFamiliar)}
        state={familiarState(familiarViewSession)}
        launches={familiarOverview.launches}
        sessions={sessions}
        history={history}
        documents={familiarOverview.documents}
        activity={familiarActivityView}
        changes={{
          sessionId: familiarViewSession.id,
          cwd: familiarOverview.cwd,
          totals: familiarOverview.changeTotals,
          request: familiarChangesRequest,
          textHarness: familiarViewSession.harness,
          projects: familiarViewFamiliar.projects,
        }}
        tab={familiarOverviewTab}
        onTabChange={setFamiliarOverviewTab}
        onOpenSession={(sessionId) =>
          familiarView.showLaunchedSession(familiarViewSession.id, sessionId)
        }
        shownSession={familiarShownSessionView}
        // Back lands on every session it started.
        onBackFromSession={() => {
          setFamiliarShownSession(null);
          setFamiliarShownSessionFocused(false);
        }}
        onOpenSessionInWorkspace={onOpenMonoLaunchedSession}
        onOpenDocument={(id) => {
          setFamiliarShownSession(null);
          setFamiliarOverviewDocument(id);
        }}
        shownDocumentId={familiarOverviewDocument ?? undefined}
        onBackFromDocument={() => setFamiliarOverviewDocument(null)}
        onOpenFile={onOpenFile}
        onClose={() => setFamiliarOverviewOpen(false)}
        windowControls={familiarCovers && !IS_MAC ? <WindowControls /> : undefined}
      />
    ) : null;
  const familiarSettingsDialog =
    familiarCovers &&
    familiarViewFamiliar &&
    familiarViewSession &&
    familiarSettingsFor === familiarViewFamiliar.id ? (
      <FamiliarSettingsDialog
        key={familiarViewFamiliar.id}
        familiarId={familiarViewFamiliar.id}
        agent={familiarLook(familiarViewFamiliar)}
        status={familiarState(familiarViewSession).status}
        cwd={familiarViewSession.cwd}
        harness={familiarViewSession.harness}
        model={familiarViewSession.model}
        modelSettings={familiarViewSession.modelSettings}
        runtimeMode={familiarViewSession.runtimeMode}
        busy={!!familiarViewSession.busy}
        onModelChange={(harness, model) =>
          onModelChange(familiarViewSession.id, harness, model)
        }
        onModelSettingsChange={(settings) =>
          onModelSettingsChange(familiarViewSession.id, settings)
        }
        onRuntimeModeChange={(mode) =>
          onRuntimeModeChange(familiarViewSession.id, mode)
        }
        onReset={() => onResetFamiliar(familiarViewSession.id)}
        onClose={() => setFamiliarSettingsFor(null)}
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
  const onDismissUpdate = useCallback(() => setUpdateNotice(null), []);

  const chromeSurfaceOpen =
    searchViewOpen ||
    settingsOpen ||
    inboxViewOpen ||
    notesViewOpen ||
    automationsViewOpen;
  const compactProjectRail = collapsedProjectRailMode === "compact";
  const compactRailActive = compactProjectRail && !projectRailOpen;
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
  // The right panel grows from the card's edge and pushes the workspace. Its
  // own contents keep their full width and ride its edge.
  // A reversal mid-slide starts from wherever the width currently is.
  useLayoutEffect(() => {
    const toggled = rightPanelWasOpen.current !== rightPanelOpen;
    rightPanelWasOpen.current = rightPanelOpen;
    const pane = rightPanelRef.current;
    const content = pane?.firstElementChild;
    if (!toggled || !pane || !(content instanceof HTMLElement)) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animate =
      insetRightPanelShown && typeof pane.animate === "function" && !reduceMotion;
    const current = pane.getBoundingClientRect().width;
    const from = rightPanelAnimation.current || !rightPanelOpen ? current : 0;
    rightPanelAnimation.current?.cancel();
    rightPanelAnimation.current = null;
    endRightPanelTransition.current?.();
    endRightPanelTransition.current = null;
    if (!animate) {
      content.style.width = "";
      if (!rightPanelOpen) setRightPanelClosing(false);
      return;
    }
    // The committed width; a running slide only overrides it. Only the
    // width is pinned: the column still stretches the contents to full
    // height, so the panel's scrolling content stays put while it slides.
    const full = parseFloat(pane.style.width) || pane.offsetWidth;
    content.style.width = `${full}px`;
    endRightPanelTransition.current = beginLayoutTransition();
    const animation = pane.animate(
      [{ width: `${from}px` }, { width: `${rightPanelOpen ? full : 0}px` }],
      {
        duration: rightPanelOpen ? 240 : 200,
        easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        fill: "forwards",
      },
    );
    rightPanelAnimation.current = animation;
    animation.onfinish = () => {
      if (rightPanelAnimation.current !== animation) return;
      if (rightPanelOpen) {
        animation.cancel();
        rightPanelAnimation.current = null;
        endRightPanelTransition.current?.();
        endRightPanelTransition.current = null;
        content.style.width = "";
      } else {
        setRightPanelClosing(false);
      }
    };
  }, [rightPanelOpen]);
  // A slid-out panel holds its last frame until it is hidden, in the same
  // commit, so it never flashes back in place.
  useLayoutEffect(() => {
    if (rightPanelClosing || rightPanelOpen) return;
    rightPanelAnimation.current?.cancel();
    rightPanelAnimation.current = null;
    endRightPanelTransition.current?.();
    endRightPanelTransition.current = null;
    const content = rightPanelRef.current?.firstElementChild;
    if (content instanceof HTMLElement) {
      content.style.width = "";
    }
  }, [rightPanelClosing, rightPanelOpen]);
  // The same shared stats the sidebar's Changes tab reads, so the toggle
  // that opens it can carry its dot.
  const showRightPanelToggle =
    insetLayout && !settingsOpen && looksLikeProject(sidebarCwd);
  rightPanelToggleRef.current =
    showRightPanelToggle && !(familiarCovers && familiarViewFamiliar) && !activeAppView
      ? onToggleRightPanel
      : null;
  const rightPanelChanges = useProjectDiffStats(
    gitCwd || sidebarCwd,
    showRightPanelToggle && isLocalProject(sidebarCwd),
  );
  const onToggleFamiliarOverview = () => setFamiliarOverviewOpen(!familiarOverviewOpen);
  const onOpenFamiliarViewSettings = familiarViewFamiliar
    ? () => setFamiliarSettingsFor(familiarViewFamiliar.id)
    : undefined;
  // A new session takes over from a Familiar in view.
  const onNewFromTitleBar = () => {
    if (workspaceStore.getState().familiarViewId) closeFamiliarView();
    onNew();
  };
  const workspaceTitleBar = (
    <TitleBar
      // A Familiar in full view stands apart from the project's tabs, except
      // in the inset layout, where it is one of them.
      tabs={familiarCovers && !insetLayout ? NO_TITLE_TABS : titleTabs}
      content={
        insetLayout && settingsOpen ? (
          <div
            ref={setSettingsHeaderHost}
            data-settings-title
            className="flex h-full min-w-0 flex-1"
          />
        ) : undefined
      }
      familiar={
        familiarCovers && familiarViewFamiliar && familiarViewSession
          ? { look: familiarLook(familiarViewFamiliar), state: familiarState(familiarViewSession) }
          : undefined
      }
      // The inset layout keeps these in the Familiar's pane, under its tab.
      onToggleFamiliarOverview={
        familiarCovers && !insetLayout ? onToggleFamiliarOverview : undefined
      }
      familiarOverviewOpen={familiarOverviewOpen}
      onOpenFamiliarSettings={
        familiarCovers && !insetLayout ? onOpenFamiliarViewSettings : undefined
      }
      hideWindowControls={familiarCovers && familiarOverviewOpen && !!familiarOverviewPanel}
      activeId={
        familiarViewSession
          ? insetLayout
            ? (familiarViewTabId ?? "")
            : ""
          : insetLayout && activeAppView
            ? appViewTabId(activeAppView)
            : activeTabId
      }
      cwd={sidebarCwd}
      projectRailOpen={projectRailOpen}
      sessionSidebarOpen={sessionSidebarOpen}
      compactRail={!insetLayout && compactTitleNavigation}
      inset={insetLayout}
      rightPanelOpen={rightPanelOpen}
      onToggleRightPanel={
        showRightPanelToggle ? onToggleRightPanel : undefined
      }
      rightPanelDot={(rightPanelChanges?.files ?? 0) > 0}
      rightPanelUnavailable={!!activeAppView}
      canGoBack={!!familiarViewId || tabVisitNav.canBack}
      canGoForward={tabVisitNav.canForward}
      onGoBack={onRailBack}
      onGoForward={onRailForward}
      onToggleSidebar={onToggleSidebar}
      onToggleSessionSidebar={onToggleSessionSidebar}
      onSelect={onSelectTitleTab}
      onNewTerminal={onNewTerminal}
      onNewSession={
        insetLayout && !settingsOpen && looksLikeProject(sidebarCwd)
          ? onNewFromTitleBar
          : undefined
      }
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
      recents={recents}
      onSelectProject={onSelectProject}
    />
  );

  const sessionSidebar = (
    <Sidebar
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
      // The inset sidebar carries the links to the local surfaces, so it stays
      // beside them like it does beside the other views.
      open={sessionSidebarOpen && (insetLayout || localSurface === null)}
      tab={insetLayout ? "sessions" : sidebarTab}
      onTabChange={setSidebarTab}
      rightPanel={
        insetLayout && !settingsOpen && !familiarCovers
          ? {
              host: rightPanelHost,
              open: rightPanelOpen || rightPanelClosing,
              tab: rightPanelTab,
              onTabChange: showRightPanel,
            }
          : undefined
      }
      filesSearchOpen={filesSearchOpen}
      onFilesSearchOpenChange={setFilesSearchOpen}
      onOpenFilesSearch={onFindInProject}
      searchFocusToken={searchFocusToken}
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
      canGoBack={
        !!familiarViewId ||
        tabVisitNav.canBack ||
        searchViewOpen ||
        settingsOpen ||
        inboxViewOpen ||
        notesViewOpen ||
        automationsViewOpen
      }
      canGoForward={tabVisitNav.canForward}
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
      recents={recents}
      busyProjectPaths={busyProjectPaths}
      liveAgents={liveAgents}
      onSelectAgent={onSelectLiveAgent}
      onStopAgent={onCloseLiveAgent}
      onSelectProject={onSelectProject}
      onOpenProject={pickProject}
      onRemoveProject={onRemoveProject}
      familiars={sidebarFamiliars}
      familiarViewActive={familiarCovers}
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
      searchActive={searchViewOpen}
      inboxActive={inboxViewOpen}
      notesActive={notesViewOpen}
      automationsActive={automationsSurfaceOpen}
      railExtraActions={localSurfaceRailActions}
      localSurfaces={{
        active: localSurface,
        visible: railSurfaces,
        onOpen: onOpenLocalSurface,
        badges: railBadges,
      }}
      notesEnabled={notesEnabled}
      // The inset layout has no project rail: the sidebar header's menu
      // switches projects.
      projectRailOpen={!insetLayout && projectRailOpen}
      compactProjectRail={!insetLayout && compactProjectRail}
      titleBarAbove={insetLayout || compactTitleBar}
      inset={insetLayout}
      onToggleProjectRail={onToggleProjectRail}
      unseenFinishedIds={unseenFinishedIds}
      inboxUnseen={inboxUnseen}
      linkedSessionUpdateIds={linkedSessionUpdateIds}
      settingsOpen={settingsOpen}
      settingsSection={settingsSection}
      onOpenSettings={onOpenSettings}
      onOpenNotificationSettings={onOpenNotificationSettings}
      onSelectSettingsSection={onSelectSettingsSection}
      onCloseSettings={onCloseSettings}
      updateNotice={updateNotice}
      onOpenWhatsNew={onOpenWhatsNew}
      onDismissUpdate={onDismissUpdate}
    />
  );

  const usageFooter =
    (chromeSurfaceOpen && !(insetLayout && activeAppView)) ||
    (familiarCovers && !insetLayout) ? null : (
      <UsageFooter
        pressureSlot={setPressureChipHost}
        providers={usageProviders}
        session={usageSession}
        project={usageSource?.cwd ?? projectCwd}
        onSelectAccount={onSelectProviderAccount}
        onManageAccounts={() => openSettings("providers", "provider-accounts")}
        // A Familiar in full view has no terminal of its own.
        terminals={familiarCovers ? undefined : runningTerminals}
        terminalOpen={!familiarCovers && runningTerminalOpen}
        onToggleTerminal={onToggleRunningTerminal}
        onNewTerminal={
          !familiarCovers && isLocalProject(projectCwd) ? onNewTerminal : undefined
        }
        onToggleProjectTerminal={
          !familiarCovers && isLocalProject(projectCwd)
            ? onToggleProjectTerminal
            : undefined
        }
        projectTerminalActive={
          !familiarCovers &&
          !!currentProjectDock &&
          currentProjectDock.pane.files.length > 0
        }
        projectTerminalOpen={!familiarCovers && !!currentProjectDock?.open}
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
                      searchViewOpen ||
                      settingsOpen ||
                      inboxViewOpen ||
                      notesViewOpen ||
                      automationsViewOpen
                        ? "hidden"
                        : "flex min-h-0 min-w-0 flex-1 flex-col"
                    }
                    aria-hidden={
                      searchViewOpen ||
                      settingsOpen ||
                      inboxViewOpen ||
                      notesViewOpen ||
                      automationsViewOpen
                    }
                    inert={
                      searchViewOpen ||
                      settingsOpen ||
                      inboxViewOpen ||
                      notesViewOpen ||
                      automationsViewOpen ||
                      undefined
                    }
                  >
                    {!IS_MAC ? (
                      <MenuBar
                        onNew={onNew}
                        onNewTerminal={onNewTerminal}
                        onToggleTerminal={onToggleProjectTerminal}
                        onGoToFile={onGoToFile}
                        onToggleSidebar={onToggleSidebar}
                        onToggleSessionSidebar={
                          onToggleSessionSidebarShortcut
                        }
                        onShowSourceControl={onToggleChanges}
                        onCloseCurrentTab={
                          activeTabId
                            ? () => onCloseTab(activeTabId)
                            : undefined
                        }
                        onCloseOtherTabs={onCloseOtherTabs}
                        onCloseAllTabs={onCloseAllTabs}
                        onPickProject={pickProject}
                        onFindInProject={onFindInProject}
                        onSearch={onOpenSearch}
                        onOpenInbox={onOpenInbox}
                        onOpenNotes={notesEnabled ? onOpenNotes : undefined}
                        onZoomIn={() => {
                          const next = saveUiScale(
                            zoomInUiScale(loadUiScale()),
                          );
                          void applyUiScale(next);
                        }}
                        onZoomOut={() => {
                          const next = saveUiScale(
                            zoomOutUiScale(loadUiScale()),
                          );
                          void applyUiScale(next);
                        }}
                        onZoomReset={() => {
                          saveUiScale(UI_SCALE_DEFAULT);
                          void applyUiScale(UI_SCALE_DEFAULT);
                        }}
                      />
                    ) : null}
                    <div className="flex min-h-0 min-w-0 flex-1">
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        {titleBarInBody ? workspaceTitleBar : null}

                        <main className="relative flex min-h-0 min-w-0 flex-1">
                          <div
                            ref={dockGridRef}
                            className="grid h-full min-h-0 min-w-0 flex-1"
                          >
                            {projectTerminals.map((dock) => {
                              const show =
                                (dock.open || dockClosingShown) &&
                                !familiarCovers &&
                                sameProjectPath(dock.projectPath, projectCwd);
                              return (
                                <div
                                  key={dock.projectPath}
                                  className={
                                    show
                                      ? "h-full min-h-0 min-w-0 w-full overflow-hidden"
                                      : "hidden"
                                  }
                                  style={
                                    show ? { gridArea: "dock" } : undefined
                                  }
                                  aria-hidden={!show}
                                  data-dock-shown={show ? "" : undefined}
                                >
                                  <ProjectTerminalDock
                                    dock={dock}
                                    focused={show && projectTerminalFocused}
                                    onFocus={focusProjectTerminal}
                                    onHide={onHideProjectTerminal}
                                    onSideChange={onProjectTerminalSide}
                                    onSizePaint={paintDockSize}
                                    onSizeCommit={commitDockSize}
                                    onAddTerminal={onNewTerminal}
                                    onSelectTerminal={onSelectProjectTerminal}
                                    onCloseTerminal={onCloseProjectTerminal}
                                    onCloseOtherTerminals={
                                      onCloseOtherProjectTerminals
                                    }
                                    onReorderTerminals={
                                      onReorderProjectTerminals
                                    }
                                    onTerminalMetaChange={onTerminalMetaChange}
                                  />
                                </div>
                              );
                            })}
                            <div
                              className="relative flex min-h-0 min-w-0 flex-row"
                              style={{ gridArea: "main" }}
                            >
                              <div className="relative min-h-0 min-w-0 flex-1">
                                {tabs.map((tab) => (
                                  <div
                                    key={tab.id}
                                    data-workspace-tab={tab.id}
                                    aria-hidden={
                                      tab.id !== activeTabId || familiarCovers
                                    }
                                    className={
                                      tab.id === activeTabId && !familiarCovers
                                        ? "absolute inset-0 flex h-full min-h-0 flex-col"
                                        : "hidden"
                                    }
                                  >
                                    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                                      <PaneTree
                                        {...sessionPaneProps}
                                        visible={
                                          tab.id === activeTabId &&
                                          !inboxViewOpen &&
                                          !familiarCovers
                                        }
                                        layout={tab.layout}
                                        sessions={sessions}
                                        editorPanes={[
                                          ...tab.editorPanes,
                                          ...(tab.terminalPanes ?? []),
                                        ]}
                                        dirtyFileIds={dirtyFiles}
                                        fileErrorCounts={fileErrorCounts}
                                        focusedId={
                                          tab.id === activeTabId &&
                                          !familiarViewId &&
                                          !inboxViewOpen &&
                                          !tab.diffFocused &&
                                          !projectTerminalFocused
                                            ? tab.focusedId
                                            : ""
                                        }
                                        addToChatSessionId={
                                          tab.id === activeTabId
                                            ? active?.id
                                            : undefined
                                        }
                                        composerFocused={
                                          composerFocused &&
                                          !projectTerminalFocused &&
                                          !familiarViewId
                                        }
                                        composerFocusToken={composerFocusToken}
                                        onSelectFile={onSelectFileSurface}
                                        onCloseFile={onCloseFile}
                                        onCloseOtherFiles={onCloseOtherFiles}
                                        onPinFile={onPinFile}
                                        onReorderFiles={onReorderFiles}
                                        onFileDirtyChange={onFileDirtyChange}
                                        onFileErrorCountChange={
                                          onFileErrorCountChange
                                        }
                                        transcriptPool={transcriptPool}
                                        onRatio={(splitId, index, ratio) =>
                                          onRatio(tab.id, splitId, index, ratio)
                                        }
                                        editorNavigation={editorNavigation}
                                        onUpdatePlan={onUpdatePlan}
                                        onMovePane={onMovePane}
                                        onDetachPane={onDetachPane}
                                        onTerminalMetaChange={
                                          onTerminalMetaChange
                                        }
                                      />
                                    </div>
                                  </div>
                                ))}
                                {sessions
                                  .filter((session) =>
                                    isFamiliarSession(session.id),
                                  )
                                  .map((session) => {
                                    const visible = familiarViewId === session.id;
                                    return (
                                      <div
                                        key={session.id}
                                        data-familiar-view={session.id}
                                        aria-hidden={!visible}
                                        inert={!visible || undefined}
                                        className={
                                          visible
                                            ? "absolute inset-0 flex h-full min-h-0 flex-col"
                                            : "hidden"
                                        }
                                      >
                                        {insetLayout &&
                                        visible &&
                                        familiarViewFamiliar ? (
                                          <FamiliarViewActions
                                            name={familiarLook(familiarViewFamiliar).name}
                                            overviewOpen={familiarOverviewOpen}
                                            onToggleOverview={
                                              onToggleFamiliarOverview
                                            }
                                            onOpenSettings={
                                              onOpenFamiliarViewSettings
                                            }
                                            // The overview header's row, so both share a centre line.
                                            className="absolute right-2.5 top-0 z-10 h-10"
                                          />
                                        ) : null}
                                        <SessionPane
                                          {...sessionPaneProps}
                                          session={session}
                                          visible={visible}
                                          focused={
                                            visible &&
                                            !projectTerminalFocused &&
                                            !familiarShownSessionActive
                                          }
                                          inSplit={false}
                                          addToChatTarget={visible}
                                          composerFocused={
                                            visible &&
                                            composerFocused &&
                                            !projectTerminalFocused &&
                                            !familiarShownSessionActive
                                          }
                                          composerFocusToken={
                                            composerFocusToken
                                          }
                                          onShowFamiliarActivity={
                                            onShowFamiliarActivity
                                          }
                                          onOpenArtifact={onOpenMonoArtifact}
                                          onOpenDiff={onOpenMonoDiff}
                                          onCommitChanges={onCommitMonoChanges}
                                          familiarActivityTurnId={
                                            familiarOverview.activityShownTurnId
                                          }
                                          onOpenFamiliarSession={onOpenFamiliarSession}
                                          familiarLaunchedSessions={
                                            visible
                                              ? familiarOverview.launchedSessions
                                              : undefined
                                          }
                                          openFamiliarSessionId={shownFamiliarSessionId}
                                          // The inset footer stays under a
                                          // Familiar and shows its usage.
                                          familiarComposerUsage={!insetLayout}
                                        />
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>
                          {[...linkedWorkItemPanels.values()].map((panel) => (
                            <LinkedWorkItemPanel
                              repairSessions={repairSessions}
                              onRepairChecks={onRepairChecks}
                              onOpenSession={(sessionId) => {
                                linkedPanels.close(panel.sessionId);
                                onOpenInboxSession(sessionId);
                              }}
                              key={panel.sessionId}
                              target={panel.item}
                              cwd={panel.cwd}
                              recents={recents}
                              visible={
                                !searchViewOpen &&
                                !settingsOpen &&
                                !inboxViewOpen &&
                                !notesViewOpen &&
                                !automationsViewOpen &&
                                !familiarViewId &&
                                activeLinkedWorkItemPanel?.sessionId ===
                                  panel.sessionId
                              }
                              onClose={() =>
                                linkedPanels.close(panel.sessionId)
                              }
                            />
                          ))}
                        </main>
                      </div>
                      {familiarCovers ? familiarOverviewPanel : null}
                      {familiarSettingsDialog}
                    </div>
                  </div>
                  {searchViewOpen ||
                  (insetLayout && openAppViews.includes("search")) ? (
                    <AppViewSurface active={searchViewOpen}>
                      <SearchView
                        tabbed={insetLayout}
                        open={searchViewOpen}
                        cwd={gitCwd}
                        recents={recents}
                        history={projectHistory}
                        sessions={sessions.filter((session) => !session.inboxAsk)}
                        focusToken={searchViewFocusToken}
                        besideRail={
                          insetLayout || projectRailOpen || compactProjectRail
                        }
                        compactRail={!insetLayout && compactRailActive}
                        onClose={onLeaveSearch}
                        onToggleSidebar={onToggleSidebar}
                        onOpenFile={onOpenFile}
                        onOpenSession={(sessionId, blockId, query) => {
                          if (blockId)
                            requestTranscriptJump(sessionId, blockId, query);
                          void onSelectHistorySession(sessionId);
                        }}
                        onOpenProject={onSelectProject}
                      />
                    </AppViewSurface>
                  ) : null}
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
                  {inboxViewOpen ||
                  (insetLayout && openAppViews.includes("inbox")) ? (
                    <AppViewSurface active={inboxViewOpen}>
                      <InboxView
                        tabbed={insetLayout}
                        active={inboxViewOpen}
                        cwd={sidebarCwd}
                        scopeProject={appViewScope}
                        recents={recents}
                        besideRail={
                          insetLayout || projectRailOpen || compactProjectRail
                        }
                        compactRail={!insetLayout && compactRailActive}
                        onClose={onLeaveInbox}
                        onToggleSidebar={onToggleSidebar}
                        onStart={onStartInboxItem}
                        onAsk={onAskInboxItem}
                        onAskRestart={onRestartInboxAsk}
                        onAskMount={setInboxAskPortal}
                        sessions={inboxRelatedSessions}
                        repairSessions={repairSessions}
                        onRepairChecks={onRepairChecks}
                        onOpenSession={onOpenInboxSession}
                        onOpenIntegrations={onOpenInboxIntegrations}
                      />
                    </AppViewSurface>
                  ) : null}
                  {notesViewOpen ||
                  (insetLayout && notesEnabled && openAppViews.includes("notes")) ? (
                    <AppViewSurface active={notesViewOpen}>
                      <NotesView
                        tabbed={insetLayout}
                        active={notesViewOpen}
                        besideRail={
                          insetLayout || projectRailOpen || compactProjectRail
                        }
                        compactRail={!insetLayout && compactRailActive}
                        cwd={projectCwd}
                        scopeProject={appViewScope}
                        recents={recents}
                        onClose={onLeaveNotes}
                        onToggleSidebar={onToggleSidebar}
                      />
                    </AppViewSurface>
                  ) : null}
                  <LocalSurfaceViews
                    surface={localSurface}
                    besideRail={
                      insetLayout || projectRailOpen || compactProjectRail
                    }
                    compactRail={!insetLayout && compactRailActive}
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
                  {automationsSurfaceOpen ||
                  (insetLayout && openAppViews.includes("automations")) ? (
                    <AppViewSurface active={automationsSurfaceOpen}>
                      <AutomationsView
                        tabbed={insetLayout}
                        besideRail={
                          insetLayout || projectRailOpen || compactProjectRail
                        }
                        compactRail={!insetLayout && compactRailActive}
                        cwd={projectCwd}
                        scopeProject={appViewScope}
                        recents={recents}
                        focusAutomationId={automationsFocusId}
                        onFocusAutomationConsumed={onAutomationsFocusConsumed}
                        onClose={onLeaveAutomations}
                        onToggleSidebar={onToggleSidebar}
                        onLaunch={(automation, run) =>
                          launchAutomation(automation, run, true)
                        }
                        onOpenSession={onOpenAutomationSession}
                      />
                    </AppViewSurface>
                  ) : null}
                  {settingsOpen ? (
                    <SettingsView
                      section={settingsSection}
                      anchor={settingsAnchor}
                      notificationProjectPath={notificationProjectPath}
                      notificationSettingsRequest={notificationSettingsRequest}
                      recents={recents}
                      cwd={sidebarCwd}
                      sessions={sidebarHistory}
                      liveSessions={sessions}
                      onRemoveWorktree={onRemoveWorktree}
                      onCheckWorktreeRemoval={onCheckWorktreeRemoval}
                      onDeleteWorktreeSessions={onDeleteWorktreeSessions}
                      besideRail
                      headerHost={insetLayout ? settingsHeaderHost : undefined}
                      onClose={onCloseSettings}
                      onSelectSection={onSelectSettingsSection}
                      onOpenSession={onOpenArchivedSession}
                      onArchiveSession={onArchiveHistorySession}
                      onDeleteSession={onDeleteHistorySession}
                      onRestoreProject={onRestoreProject}
                      onDeleteProject={(path) =>
                        onRemoveProject(path, { purgeData: true })
                      }
                      onOpenWhatsNew={onOpenWhatsNew}
                      collapsedProjectRailMode={collapsedProjectRailMode}
                      onCollapsedProjectRailModeChange={
                        setCollapsedProjectRailMode
                      }
                    />
                  ) : null}
                  {insetLayout ? null : usageFooter}
                </div>
                {insetLayout ? (
                  // Part of the card: the project tools beside the
                  // workspace, behind a hairline.
                  <div
                    ref={setRightPanelRef}
                    inert={rightPanelClosing || undefined}
                    className={
                      insetRightPanelShown
                        ? "relative flex h-full shrink-0 flex-col overflow-hidden border-l border-stroke"
                        : "hidden"
                    }
                  >
                    <div
                      ref={setRightPanelHost}
                      aria-label="Project tools"
                      className="flex min-h-0 flex-1 flex-col"
                    />
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize right sidebar"
                      aria-valuenow={rightPanelResize.width}
                      aria-valuemin={RIGHT_PANEL_WIDTH_MIN}
                      aria-valuemax={RIGHT_PANEL_WIDTH_MAX}
                      className={`absolute inset-y-0 -left-px z-10 w-1.5 cursor-col-resize touch-none ${
                        rightPanelResize.dragging
                          ? "bg-content/15"
                          : "hover:bg-content/10"
                      }`}
                      onPointerDown={rightPanelResize.onPointerDown}
                      onDoubleClick={rightPanelResize.onDoubleClick}
                    />
                  </div>
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

          {filePickerOpen ? (
            <FilePicker
              key={filePickerResetToken}
              open
              cwd={filesCwd}
              openPaths={openFilePaths}
              initialQuery={filePickerInitialQuery}
              onOpenFile={onOpenFile}
              onRunAction={(id) => {
                if (id === "reload") actions.current.onReload();
              }}
              onClose={() => setFilePickerOpen(false)}
            />
          ) : null}

          {sessionDeleteDialog && (
            <DeleteSessionDialog
              title={sessionDeleteDialog.title}
              unusedWorktree={sessionDeleteDialog.unusedWorktree}
              onClose={(choice) => {
                sessionDeleteDialog.resolve(choice);
                setSessionDeleteDialog(undefined);
              }}
            />
          )}
          <HarnessUpdateNotice
            topOffset={
              12 + (reminderNoticesHeight ? reminderNoticesHeight + 8 : 0)
            }
            onHeightChange={setHarnessUpdateHeight}
          />
          <NewLayoutNotice
            topOffset={
              12 +
              (reminderNoticesHeight ? reminderNoticesHeight + 8 : 0) +
              (harnessUpdateHeight ? harnessUpdateHeight + 8 : 0)
            }
            onHeightChange={setNewLayoutNoticeHeight}
          />
          <ResourcePressureNotice
            sessions={sessionsRef}
            onStopAgent={(id) => onStop(id, true)}
            onStopSession={onStop}
            onPressureChange={transcriptPool.setResourcePressure}
            chipHost={pressureChipHost}
            insetChip={insetLayout}
          />
          <ApprovalToasts
            notices={hiddenApprovalToasts}
            topOffset={
              12 +
              (reminderNoticesHeight ? reminderNoticesHeight + 8 : 0) +
              (harnessUpdateHeight ? harnessUpdateHeight + 8 : 0) +
              (newLayoutNoticeHeight ? newLayoutNoticeHeight + 8 : 0)
            }
            onFocusSession={onOpenApprovalSession}
            onApproval={onApproval}
          />
          <ReminderNotices
            reminders={sessionReminders.due}
            error={sessionReminders.error}
            onOpen={sessionReminders.open}
            onSnooze={sessionReminders.schedule}
            onDismiss={sessionReminders.cancel}
            onRetry={sessionReminders.refresh}
            onOpenSettings={() => openSettings("general", "notifications")}
            onHeightChange={setReminderNoticesHeight}
          />
          {whatsNewVersion ? (
            <WhatsNewDialog
              version={whatsNewVersion}
              onClose={() => setWhatsNewVersion(null)}
            />
          ) : null}
          <UpdatePromptDialog />
          <AppDialog />
          {remoteProjectDialogOpen ? (
            <AddRemoteProjectDialog
              onCancel={() => setRemoteProjectDialogOpen(false)}
              onOpen={(key) => {
                setRemoteProjectDialogOpen(false);
                onSelectProject(key);
              }}
            />
          ) : null}
          {providerSignInRequest ? (
            <ProviderSignInDialog
              key={providerSignInRequest.key}
              harness={providerSignInRequest.harness}
              onClose={() => setProviderSignInRequest(null)}
            />
          ) : null}
        </div>
        <TranscriptPoolOutlet pool={transcriptPool} />
      </OrchestrationWorkers.Provider>
    </OrchestrationActions.Provider>
    </SessionStateContext.Provider>
  );
}
function conversationTitle(session: Session): string {
  const hostId = isRemoteProjectPath(session.cwd)
    ? remoteSessionFor(session.id)
    : undefined;
  const remote = hostId
    ? cachedRemoteSessionSummary(session.cwd, hostId)
    : undefined;
  const title = sessionDisplayTitle(
    remote?.title ?? session.title,
    remote?.harness ?? session.harness,
  );
  return title === "New session" ? "" : title;
}

function providerSignInRequestKey(session: Session): string {
  const lastBlockId = session.blocks[session.blocks.length - 1]?.id;
  return `${session.id}:${lastUserBlockId(session) ?? lastBlockId ?? "auth"}`;
}

function selectedChangePath(
  tab: WorkspaceTab,
  gitCwd?: string,
): string | undefined {
  const file = focusedFileTab(tab);
  if (!file || !isFilesystemTab(file) || !file.review) return undefined;
  return displayPath(file.path, gitCwd || file.cwd);
}

function selectedChangeKind(tab: WorkspaceTab): GitFileDiffKind | undefined {
  const file = focusedFileTab(tab);
  return file?.review ? file.changeKind : undefined;
}

function selectedCommitSha(tab: WorkspaceTab): string | undefined {
  const focused = focusedFileTab(tab);
  if (focused && isCommitTab(focused)) return focused.commit.sha;
  for (const pane of tab.editorPanes) {
    const file = pane.files.find((entry) => entry.id === pane.activeFileId);
    if (file && isCommitTab(file)) return file.commit.sha;
  }
}

function toTitleTab(
  tab: WorkspaceTab,
  sessions: Session[],
  dirtyFiles: Set<string>,
  unseenFinishedIds: ReadonlySet<string>,
): TitleTab {
  const paneIds = leafIds(tab.layout);
  const multiPane = paneIds.length > 1;
  const tabSessions = paneIds
    .map((id) => sessions.find((session) => session.id === id))
    .filter((session): session is Session => session != null);
  const sessionFocused = tabSessions.some(
    (session) => session.id === tab.focusedId,
  );
  const fileFocused =
    !sessionFocused &&
    (tab.editorPanes.some((pane) => pane.id === tab.focusedId) ||
      (tab.terminalPanes ?? []).some((pane) => pane.id === tab.focusedId));
  const focused =
    sessions.find((session) => session.id === tab.focusedId) ?? tabSessions[0];

  const seen = new Set<HarnessId>();
  const harnesses: HarnessId[] = [];
  const busySeen = new Set<HarnessId>();
  const busyHarnesses: HarnessId[] = [];
  const doneSeen = new Set<HarnessId>();
  const doneHarnesses: HarnessId[] = [];
  const ordered = focused
    ? [focused, ...tabSessions.filter((session) => session.id !== focused.id)]
    : tabSessions;
  for (const session of ordered) {
    if (
      session.busy &&
      !sessionNeedsInput(session) &&
      !busySeen.has(session.harness)
    ) {
      busySeen.add(session.harness);
      busyHarnesses.push(session.harness);
    }
    if (unseenFinishedIds.has(session.id) && !doneSeen.has(session.harness)) {
      doneSeen.add(session.harness);
      doneHarnesses.push(session.harness);
    }
    if (seen.has(session.harness)) continue;
    seen.add(session.harness);
    harnesses.push(session.harness);
  }

  const files: string[] = [];
  const seenKeys = new Set<string>();
  const pushFile = (file: FilePaneTab) => {
    const key = file.terminal
      ? `terminal:${file.id}`
      : file.plan
        ? `plan:${file.plan.blockId}`
        : file.releaseNotes
          ? `release-notes:${file.releaseNotes.version}`
          : file.path;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    files.push(
      file.plan?.title?.trim() ||
        (file.releaseNotes
          ? releaseNotesTitle(file.releaseNotes.version)
          : file.terminal
            ? terminalTabLabel(file)
            : basename(file.path)),
    );
  };
  const focusedPane =
    tab.editorPanes.find((pane) => pane.id === tab.focusedId) ??
    (tab.terminalPanes ?? []).find((pane) => pane.id === tab.focusedId);
  const otherPanes = [
    ...tab.editorPanes.filter((pane) => pane.id !== focusedPane?.id),
    ...(tab.terminalPanes ?? []).filter((pane) => pane.id !== focusedPane?.id),
  ];
  const panes = focusedPane ? [focusedPane, ...otherPanes] : otherPanes;
  for (const pane of panes) {
    const active = pane.files.find((file) => file.id === pane.activeFileId);
    if (active) pushFile(active);
  }
  for (const pane of panes) {
    for (const file of pane.files) pushFile(file);
  }

  const more = tabSessions
    .filter((session) => session.id !== focused?.id)
    .map(conversationTitle)
    .filter(Boolean);

  const hasTerminal = (tab.terminalPanes ?? []).some((pane) =>
    pane.files.some(isTerminalTab),
  );
  const focusedFile = focusedFileTab(tab);

  return {
    id: tab.id,
    project: focused
      ? projectName(focused.cwd)
      : focusedFile
        ? projectName(focusedFile.projectCwd ?? focusedFile.cwd)
        : "~",
    title: focused ? conversationTitle(focused) : "",
    more,
    sessionCount: tabSessions.length,
    harnesses,
    busyHarnesses,
    doneHarnesses,
    files,
    multiPane,
    fileFocused,
    blank: isBlankWorkspaceTab(tab, sessions),
    dirty: tab.editorPanes.some((pane) =>
      pane.files.some(
        (file) => isFilesystemTab(file) && dirtyFiles.has(file.id),
      ),
    ),
    terminal: hasTerminal && harnesses.length === 0,
    previewFileId: previewWorkspaceFile(tab)?.id,
    groupId: tab.groupId,
  };
}

function dropOpenFiles(
  tab: WorkspaceTab,
  shouldDrop: (path: string) => boolean,
): WorkspaceTab {
  let layout = tab.layout;
  let focusedId = tab.focusedId;
  const editorPanes: EditorPane[] = [];
  for (const pane of tab.editorPanes) {
    const files = pane.files.filter(
      (file) => !isFilesystemTab(file) || !shouldDrop(file.path),
    );
    if (files.length === 0) {
      const sibling = siblingLeafId(layout, pane.id);
      const withoutPane = removePane(layout, pane.id);
      if (withoutPane) {
        layout = withoutPane;
        if (focusedId === pane.id)
          focusedId = sibling ?? firstLeafId(withoutPane);
      }
      continue;
    }
    editorPanes.push({
      ...pane,
      files,
      activeFileId: files.some((file) => file.id === pane.activeFileId)
        ? pane.activeFileId
        : files[0].id,
    });
  }
  return { ...tab, layout, focusedId, editorPanes };
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
