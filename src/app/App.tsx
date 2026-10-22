import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getAppDialog } from "@/shared/lib/app-dialog";
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
import { ciRepairSessions } from "@/features/inbox/model/ci-repair-sessions";
import { createHarnessEventPipeline } from "./workspace/flows/harness-events/harness-event-pipeline";
import { isForegroundSession } from "./workspace/flows/harness-events/foreground-session";
import { refreshProjectHistory } from "./workspace/flows/session-history/refresh-history";
import { createSessionPersistence } from "./workspace/flows/session-history/session-persistence";
import { createSessionLoader } from "./workspace/flows/session-history/session-loader";
import type { SessionActionsDeps } from "./workspace/flows/session-history/session-actions";
import { createSessionHistoryActions } from "./workspace/flows/session-history/session-history-actions";
import type { SessionRemovalChangeDeps } from "./workspace/flows/session-history/session-removal-change";
import type { OpenSavedSessionDeps } from "./workspace/flows/session-history/open-saved-session";
import { useIdleSessionDetach } from "./hooks/use-idle-session-detach";
import { useWorkspaceNavigation } from "./hooks/use-workspace-navigation";
import { updateSessionState } from "./model/session-state";
import { activeWorkspaceTab } from "./model/active-workspace-tab";
import type { SettingsReturnView } from "./model/settings-return/types";

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
import { useWorktreeFocus } from "@/features/source-control/model/worktree-focus";
import { homeDir } from "@/platform/tauri/fs";
import { pathKey } from "@/shared/lib/paths";
import { IS_MAC } from "@/shared/lib/platform";
import { getUpdatePrompt } from "@/features/updates/model/update-prompt";
import { noteProjectStep } from "./shell/Sidebar";
import { createWorkspaceStore } from "./workspace/store/create-workspace-store";
import { useWorkspaceActions } from "./workspace/hooks/use-workspace-actions";
import { useWorkspaceField } from "./workspace/hooks/use-workspace-field";
import { shownFamiliarSession } from "./workspace/store/familiars-slice";
import { useStableFlow } from "./workspace/hooks/use-stable-flow";
import type { WorkspaceFlowCore } from "./workspace/hooks/flows/workspace-flow-core";
import { useTabFlows } from "./workspace/hooks/flows/use-tab-flows";
import {
  type WorkspaceHandlers,
  WorkspaceHandlersContext,
} from "./workspace/handlers/workspace-handlers";
import { createSecondOpinionActions } from "./workspace/flows/second-opinion/second-opinion-actions";
import { createWorkerPaneActions } from "./workspace/flows/orchestration-workers/worker-pane-actions";
import { useWorkerDetailPanes } from "./workspace/hooks/use-worker-detail-panes";
import { createInboxActions } from "./workspace/flows/inbox/inbox-actions";
import { createComposerCardActions } from "./workspace/flows/composer/composer-cards";
import { createFamiliarActions } from "./workspace/flows/familiars/familiar-actions";
import { createReminderActions } from "./workspace/flows/reminders/reminder-actions";
import { projectGitHint } from "./workspace/hooks/sidebar/sidebar-rows";
import { useFamiliarOverviewData } from "./workspace/hooks/familiars/use-familiar-overview-data";
import {
  forgetOverviewDocument,
  leaveOverviewItems,
  openOverviewDocument,
} from "./workspace/flows/familiars/familiar-overview";
import { createFamiliarView } from "./workspace/flows/familiars/familiar-view";
import { createBtw } from "./workspace/flows/btw/btw-actions";
import { createSubmissionActions } from "./workspace/flows/submission/submission-actions";
import { createTurnQueueActions } from "./workspace/flows/turn-queue/turn-queue-actions";
import type { TurnQueueDeps } from "./workspace/flows/turn-queue/turn-queue-deps";
import { createInboxAsk } from "./workspace/flows/inbox/inbox-ask";
import type { InboxDeps } from "./workspace/flows/inbox/inbox-deps";
import { inboxRelatedSessions as relatedInboxSessions } from "./workspace/flows/inbox/inbox-related-sessions";
import { createLinkedUpdateCards } from "./workspace/flows/linked-work-items/linked-update-card";
import { createLinkedWorkItemPanels } from "./workspace/flows/linked-work-items/linked-work-item-panel";
import { useAddNoteToChat } from "./workspace/hooks/use-add-note-to-chat";
import type { WorktreeDeps } from "./workspace/flows/worktrees/worktree-deps";
import { checkOpenWorktreeFiles } from "./workspace/flows/worktrees/worktree-removal";
import { createWorktreeActions } from "./workspace/flows/worktrees/worktree-actions";
import type { ProjectDeps } from "./workspace/flows/projects/project-deps";
import { createProjectActions } from "./workspace/flows/projects/project-actions";
import type { FileDeps } from "./workspace/flows/files/file-deps";
import { createFileActions } from "./workspace/flows/files/file-actions";
import type { ComposerDeps } from "./workspace/flows/composer/composer-deps";
import { createComposerActions } from "./workspace/flows/composer/composer-actions";
import { useAddToChat } from "./workspace/hooks/use-add-to-chat";
import type { AutomationDeps } from "./workspace/flows/automations/automation-deps";
import { createAutomationRuns } from "./workspace/flows/automations/automation-runs";
import { useAutomationSchedule } from "./workspace/hooks/use-automation-schedule";
import { useOrchestratorBinding } from "./workspace/hooks/use-orchestrator-binding";
import { useOrchestrationSync } from "./workspace/hooks/use-orchestration-sync";
import type { PaneDeps } from "./workspace/flows/tabs/pane-deps";
import { createTabActions } from "./workspace/flows/tabs/tab-actions";
import { createSessionOpenerActions } from "./workspace/flows/tabs/session-opener-actions";
import { createProviderAccountActions } from "./workspace/flows/composer/provider-account";
import { createRemoteSnapshotSync } from "./workspace/flows/remote-sessions/remote-snapshot";
import { createNavigationActions } from "./workspace/flows/surfaces/navigation-actions";
import { useRightPanel, useRightPanelSlide } from "./workspace/hooks/use-right-panel";
import { useWorkspaceChrome } from "./workspace/ui/layout/use-workspace-chrome";
import { useTitleTabState } from "./workspace/hooks/use-title-tab-state";
import { commandActions } from "./workspace/hooks/commands/command-actions";
import type { CommandDeps } from "./workspace/hooks/commands/command-deps";
import { useCommandRunner } from "./workspace/hooks/commands/use-command-runner";
import { useMenuCommands } from "./workspace/hooks/commands/use-menu-commands";
import { useNativeKeybindings } from "./workspace/hooks/commands/use-native-keybindings";
import { useWorkspaceKeys } from "./workspace/hooks/commands/use-workspace-keys";
import { useLatestRef } from "./workspace/hooks/use-latest-ref";
import type { AgentAppDeps } from "./workspace/flows/agent-app/agent-app-deps";
import { createControlRequests } from "./workspace/flows/agent-app/control-requests";
import { useControlRequests } from "./workspace/hooks/use-control-requests";
import type { RemoveSessionDeps } from "./workspace/flows/session-removal/remove-session";
import { titleTabList } from "./workspace/title-tabs/title-tab-list";
import { titleTabsEqual } from "./workspace/title-tabs/title-tabs-equal";
import { createDisplayedTabs } from "./workspace/title-tabs/displayed-tabs";
import type {
  DisplayedTabNavigation,
  DisplayedTabsDeps,
  VisibleTabs,
} from "./workspace/title-tabs/displayed-tabs-deps";
import { createVisibleTabShortcuts } from "./workspace/title-tabs/visible-tab-shortcuts";
import type { SessionListDeps } from "./workspace/flows/tabs/session-list-navigation";
import type { SurfaceDeps } from "./workspace/flows/surfaces/surface-deps";
import { openAppView } from "./workspace/flows/surfaces/overlay-views";
import { createSurfaceActions } from "./workspace/flows/surfaces/surface-actions";
import { useSettingsOpenEvents } from "./workspace/hooks/use-settings-open-events";
import { createUsageLimits } from "./workspace/flows/turn-queue/usage-limits";
import { useQueueDispatch } from "./workspace/hooks/use-queue-dispatch";
import { useUsageLimitTimers } from "./workspace/hooks/use-usage-limit-timers";
import type { CloseLiveAgentDeps } from "./workspace/flows/turn-control/close-live-agent";
import type { HarnessReplyDeps } from "./workspace/flows/turn-control/harness-replies";
import { createTurnControlActions } from "./workspace/flows/turn-control/turn-control-actions";
import type { TurnControlDeps } from "./workspace/flows/turn-control/turn-control-deps";
import { useAutoContinue } from "./workspace/hooks/use-auto-continue";
import { useEscapeStop } from "./workspace/hooks/use-escape-stop";
import { createFamiliarChat } from "./workspace/flows/familiars/familiar-chat";
import { createFamiliarCompletions } from "./workspace/flows/familiars/familiar-completions";
import { useWorkspaceCompanion } from "./workspace/hooks/use-workspace-companion";
import { useWorkspaceTaskBoard } from "./workspace/hooks/use-workspace-task-board";
import { createTabVisits } from "./workspace/flows/tabs/tab-visits";
import { initialWorkspaceState } from "./workspace/store/initial-workspace";
import { WorkspaceSidebar } from "./workspace/ui/WorkspaceSidebar";
import { WorkspaceTitleBar } from "./workspace/ui/WorkspaceTitleBar";

import {
  orchestrator,
} from "@/features/orchestration/model/orchestration";
import {
  OrchestrationActions,
  OrchestrationWorkers,
} from "@/features/orchestration/ui/orchestration-actions";
import { findProjectTerminal } from "@/features/projects/model/project-terminal";

import {
  sessionChildHarnesses,
} from "@/features/sessions/model/handoff";
import {
  mergeModelSettings,
  resolveModel,
} from "@/integrations/harness/core/models/resolve-model";
import { newTerminalCwd } from "@/features/terminal/model/terminal-tab";
import {
  bindHarnessSession,
  cancelHarnessTurn,
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
} from "@/integrations/harness";

import {
  focusedFileTab,
  isFilesystemTab,
  isolateTerminalPanes,
  leafIds,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";




import type { WindowTransferPayload } from "./model/window-transfer";

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
import { newDefaultSession } from "@/features/sessions/model/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import type { Session } from "@/domain/session/session";
import { DEFAULT_RUNTIME_MODE } from "@/domain/session/runtime-mode";
import {
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
import { liveAgentsFromSessions } from "@/features/sessions/model/live-agents";
import { useUnseenFinishedSessions } from "@/features/sessions/hooks/use-unseen-finished-sessions";
import { useUnseenReplyCounts } from "@/features/sessions/hooks/use-unseen-reply-counts";
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
import type { FamiliarRemovalDeps } from "./workspace/flows/familiars/familiar-removal";
import type { OpenDiffDeps } from "./workspace/flows/files/open-diff";
import type { PlaceSessionDeps } from "./workspace/flows/tabs/place-session";
import { createProposalActions } from "./workspace/flows/orchestration-workers/proposal-actions";
import { useFamiliarHabits } from "./hooks/use-familiar-habits";
import { useDockSlide } from "./workspace/hooks/use-dock-slide";
import { createFamiliarHabitHost } from "./workspace/flows/familiars/habit-host";
import { useFloatingFamiliar } from "./hooks/use-floating-familiar";
import {
  detachFamiliarTabs,
  ensureFamiliarSession,
} from "@/features/familiars/model/familiar-workspace";
import { nativeSkillContextForSession } from "@/features/sessions/model/session-skills";
import {
  TranscriptPool,
  TranscriptPoolOutlet,
} from "@/features/sessions/ui/TranscriptPool";
import {
  removeArtifactCard,
  ARTIFACT_DELETED_EVENT,
} from "@/features/artifacts/artifacts";
import {
  warmNativeSkills,
} from "@/features/skills/model/skills";
import {
  REMOTE_HISTORY_UPDATED,
  remoteTabCwd,
} from "@/features/connections/model/connections";
import {
  remotePath,
  remoteProjectFor,
  remoteSessionGitCwd,
} from "@/features/connections/model/remote-projects";
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
import { WorkspaceAppViews } from "./workspace/ui/app-views/WorkspaceAppViews";
import { WorkspacePickerDialogs } from "./workspace/ui/notices/WorkspacePickerDialogs";
import { InsetRightPanel } from "./workspace/ui/workspace-chrome/InsetRightPanel";
import { WorkspaceLayout } from "./workspace/ui/layout/WorkspaceLayout";
import { WorkspaceSettings } from "./workspace/ui/workspace-chrome/WorkspaceSettings";
import { WorkspaceUsageFooter } from "./workspace/ui/workspace-chrome/WorkspaceUsageFooter";
import { FamiliarSessionPanes } from "./workspace/ui/workspace-main/FamiliarSessionPanes";
import { LinkedWorkItemPanels } from "./workspace/ui/workspace-main/LinkedWorkItemPanels";
import { ProjectTerminalDocks } from "./workspace/ui/workspace-main/ProjectTerminalDocks";
import { InboxAskPanes } from "./workspace/ui/app-views/InboxAskPanes";
import { WorkspaceTabPanes } from "./workspace/ui/workspace-main/WorkspaceTabPanes";
import { WorkspaceDialogs } from "./workspace/ui/notices/WorkspaceDialogs";
import { WorkspaceNotices } from "./workspace/ui/notices/WorkspaceNotices";
import { useLocalSurfaceActions } from "./model/local-surfaces/use-local-surface-actions";
import { useLocalSurfaceState } from "./model/local-surfaces/use-local-surface-state";
import { preloadNavigationWhenIdle } from "./model/preload-navigation";
import { LocalSurfaceViews } from "./ui/LocalSurfaceViews";


import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";

import {
  loadCloseToTray,
  loadFamiliarsEnabled,
  subscribeFamiliarsEnabled,
  loadIdleAgentLimit,
  loadLiveAgentsEnabled,
  subscribeLiveAgentsEnabled,
} from "@/features/settings/model/settings";
import { useNotesEnabled } from "@/features/settings/hooks/use-notes-enabled";

import {
  reconcileProjectReturn,
  type ProjectReturnMemory,
} from "@/features/projects/model/project-return";
import {
  historyWithLiveSessions,
  mergeProjectHistorySummary,
  sameSessionSummaries,
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
    setSettingsOpen,
    setFamiliarViewId,
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
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
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
  const notesEnabled = useNotesEnabled();
  const liveAgentsEnabled = useSyncExternalStore(
    subscribeLiveAgentsEnabled,
    loadLiveAgentsEnabled,
    () => true,
  );
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
      worktreeActions.change(id, tree, false, isCurrent),
    activateTab: (id) => {
      if (tabsRef.current.some((tab) => tab.id === id)) {
        tabLayout.activate(id, undefined, "workspace");
      } else {
        // A newly created tab has not rendered into tabsRef yet.
        closeFamiliarView();
        setActiveTabIdState(id);
        setComposerFocused(true);
      }
    },
    createTab: (project, focus) => newSessions.createTab(project, focus),
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
  const harnessReplyDeps = useStableFlow(
    (): HarnessReplyDeps => ({
      sessions: () => sessionsRef.current,
      decideFamiliarApproval: (familiarId, blockId, decided) =>
        familiarChat.decide(familiarId, blockId, decided),
    }),
  );
  const turnActions = useStableFlow(() =>
    createTurnControlActions({ control: turnControl, reply: harnessReplyDeps }),
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
  const sessionDefaultsRef = useLatestRef(sessionDefaults);
  const activeTabRef = useLatestRef(activeTab);

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
      openSessionTab: (session, cwd) => tabLayout.openSessionTab(session, cwd),
      selectTab: (tabId) => setActiveTabId(tabId),
      focusComposer: () => setComposerFocused(true),
      defaultCwd: () => {
        const { active, sessionDefaults } = newChatDefaultsRef.current;
        return active?.cwd || sessionDefaults?.cwd || projectCwdRef.current;
      },
      runtimeMode: () => newChatDefaultsRef.current.sessionDefaults?.runtimeMode,
      sidebarCwd: () => sidebarCwdRef.current,
      selectHistorySession: (sessionId) => sessionOpeners.selectHistory(sessionId),
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
      submit: (...args) => submission.send(...args),
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
  const gitCwd =
    activeFile?.cwd ?? (active ? sessionWorkCwd(active) : sidebarCwd);
  const terminalCwd = newTerminalCwd({
    activeFile,
    session: active,
    fallback: sidebarCwd,
  });
  const terminalCwdRef = useRef(terminalCwd);
  terminalCwdRef.current = terminalCwd;
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

  const flowCore = useStableFlow(
    (): WorkspaceFlowCore => ({
      store: workspaceStore,
      sessionsRef, setSessions, tabsRef, activeTabIdRef, projectCwdRef, sidebarCwdRef,
      sessionDefaultsRef, activeTabRef, insetLayoutRef, loadedSessionCache,
      persistence: sessionPersistence,
      setActiveTabId: setActiveTabIdState,
      selectTab: setActiveTabId,
      setComposerFocused, setAutomationsViewOpen, closeFamiliarView, leaveCoveringFamiliar,
      refreshHistory, projectOfTab, tabWorkspace,
    }),
  );
  const {
    focus: tabFocusDeps,
    layout: tabLayoutDeps,
    tabLayout,
    terminals,
    tabClose,
    newSessions,
  } = useTabFlows(flowCore, { terminalCwdRef, displayedTabNavigation });

  useEffect(() => {
    tabVisits.sync(new Set(tabs.map((tab) => tab.id)), activeTabId);
  }, [activeTabId, tabs]);

  const providerAccounts = useStableFlow(() =>
    createProviderAccountActions({
      activeSessionId: () => newChatDefaultsRef.current.active?.id,
      sessions: () => sessionsRef.current,
      updateSessions: (update) => updateSessionState(sessionsRef, setSessions, update),
      continueLimited: (sessionId, accountId) => void usageLimits.changeAccount(sessionId, accountId),
      appendTab: tabLayout.append,
      setActiveTabId: (tabId) => setActiveTabId(tabId),
      setComposerFocused,
    }),
  );

  const inboxActions = useStableFlow(() => createInboxActions(inboxDeps));
  useAddNoteToChat(inboxActions.addNoteToChat);
  const composerCards = useStableFlow(() => createComposerCardActions(setSessions));

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
      activateTab: (tabId, paneId) => tabLayout.activate(tabId, paneId),
      selectTab: (tabId) => setActiveTabId(tabId),
      appendTab: (tab, cwd) => tabLayout.append(tab, cwd),
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
      openFamiliar: (familiarId) => onOpenFamiliar(familiarId),
      focusOpenSession: (sessionId) => sessionOpeners.focusOpen(sessionId),
      replaceBlankPane: (session) => sessionOpeners.replaceBlankPane(session),
      linkedUpdates: () => linkedSessionUpdatesRef.current,
      revealLinkedUpdate: (sessionId, update) => linkedUpdateCards.reveal(sessionId, update),
    }),
  );
  const sessionListDeps = useStableFlow(
    (): SessionListDeps => ({
      ...paneDeps,
      navigationIds: sessionNavigationIdsRef,
      selectHistorySession: (sessionId) => sessionOpeners.selectHistory(sessionId),
      selectRemoteSession: newSessions.selectRemoteSession,
      prefetch: (sessionId) => onPrefetchHistorySession(sessionId),
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
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
      setSessions: (next) => setSessions(next),
      selectTab: (tabId) => setActiveTabId(tabId),
      setComposerFocused: (focused) => setComposerFocused(focused),
    }),
  );
  const deckProjectTabsRef = useLatestRef(deckProjectTabs);
  const tabActions = useStableFlow(() =>
    createTabActions({
      pane: paneDeps,
      diff: openDiffDeps,
      layout: tabLayoutDeps,
      place: placeSessionDeps,
      visits: tabVisits,
      deckTabs: () => deckProjectTabsRef.current,
      activeTab: () => activeTabRef.current,
    }),
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
  const sessionOpeners = useStableFlow(() =>
    createSessionOpenerActions({ focus: tabFocusDeps, saved: openSavedSessionDeps, pane: paneDeps }),
  );

  const onPrefetchHistorySession = sessionLoader.prefetch;

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

  const familiarsEnabledRef = useLatestRef(familiarsEnabled);
  const familiarActions = useStableFlow(() =>
    createFamiliarActions({
      store: workspaceStore,
      view: familiarView,
      familiarsEnabled: () => familiarsEnabledRef.current,
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
      setSidebarTab: (tab, project) => setSidebarTab(tab, project),
      selectHistorySession: (sessionId) => sessionOpeners.selectHistory(sessionId),
    }),
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
      visitBack: () => tabActions.visitBack(),
      visitForward: () => tabActions.visitForward(),
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
      selectHistorySession: (sessionId) => sessionOpeners.selectHistory(sessionId),
    }),
  );
  const surfaces = useStableFlow(() => createSurfaceActions(surfaceDeps));
  useSettingsOpenEvents(surfaces.openSettings, surfaces.openRemoteProjectDialog);
  const reminders = useStableFlow(() =>
    createReminderActions({
      sessionsRef,
      upsertSession,
      dismissDueReminder: (sessionId) => sessionRemindersRef.current.dismissDue(sessionId),
      updateLinkedCard: linkedUpdateCards.update,
    }),
  );
  const sessionReminders = useSessionReminders(
    surfaces.openConversation,
    reminders.ensureSaved,
    sessions
      .filter((session) => !session.inboxAsk)
      .map((session) => session.id),
  );
  const sessionRemindersRef = useLatestRef(sessionReminders);

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
      appendTab: (tab, cwd) => tabLayout.append(tab, cwd),
      openSessionTab: (session, cwd) => tabLayout.openSessionTab(session, cwd),
      selectTab: (tabId) => setActiveTabId(tabId),
      focusComposer: () => setComposerFocused(true),
      refreshHistory: (cwd) => refreshHistory(cwd),
      projectOfTab: (tabId) => projectOfTab(tabId),
    }),
  );
  const worktreeActions = useStableFlow(() => createWorktreeActions(worktreeDeps));

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
      activateTab: (tabId) => tabLayout.activate(tabId),
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
      removeWorktree: (cwd, path, force) => worktreeActions.remove(cwd, path, force),
    }),
  );
  const familiarRemovalDeps = useStableFlow(
    (): Omit<FamiliarRemovalDeps, "removeSession"> => ({
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
    }),
  );
  const historyActions = useStableFlow(() =>
    createSessionHistoryActions({
      session: sessionActionDeps,
      removal: removeSessionDeps,
      link: {
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
      familiarRemoval: familiarRemovalDeps,
      setSessionArchived,
      archiveContext: () => ({
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
      }),
    }),
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
      activateTab: (tabId, paneId) => tabLayout.activate(tabId, paneId),
      insertBeside: tabLayout.insertBeside,
      changeSessionProject: (sessionId, cwd) => worktreeActions.changeProject(sessionId, cwd),
      selectTab: (tabId) => setActiveTabId(tabId),
      focusComposer: () => setComposerFocused(true),
      fileMoved: (from, to) => fileActions.moved(from, to),
    }),
  );
  const projectActions = useStableFlow(() => createProjectActions(projectDeps));


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
      insertBesideActive: (tabs, tab, cwd) => tabLayout.insertBesideActive(tabs, tab, cwd),
      activateTab: (tabId, paneId) => tabLayout.activate(tabId, paneId),
      selectTab: (tabId) => setActiveTabId(tabId),
      setComposerFocused: (focused) => setComposerFocused(focused),
    }),
  );
  const fileActions = useStableFlow(() => createFileActions(fileDeps));



  const composerDeps = useStableFlow(
    (): ComposerDeps => ({
      store: workspaceStore,
      sessionsRef,
      setSessions,
      persistence: sessionPersistence,
      invalidateLoadedSession: (sessionId) => invalidateLoadedSession(sessionId),
    }),
  );
  const composerActions = useStableFlow(() => createComposerActions(composerDeps));

  const submission = useStableFlow(() =>
    createSubmissionActions({
      sessionsRef,
      setSessions,
      turnGen,
      activeSessionIdRef,
      removingSessionIds,
      switchingWorktrees,
      removingWorktreePaths,
      projectLocationSyncs,
      workspacePins,
      editedResends,
      workspaceNavigation,
      enqueueHarnessEvent,
      flushHarnessEvents,
      dismissNoticesForContinuedSession: (sessionId) =>
        reminders.dismissContinuedNotices(sessionId),
      applyProjectLocationChange: (from, to) => projectActions.moveLocation(from, to),
    }),
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
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
      submitSession: submission.submit,
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
      appendTab: (tab, cwd) => tabLayout.append(tab, cwd),
      selectTab: (tabId) => setActiveTabId(tabId),
      setComposerFocused: (focused) => setComposerFocused(focused),
      focusOpenSession: (sessionId) => sessionOpeners.focusOpen(sessionId),
      setSidebarTab: (tab, project) => setSidebarTab(tab, project),
      closeAutomations: () => setAutomationsViewOpen(false),
      submitSession: submission.submit,
      saveDraft: (...args) => composerActions.saveDraft(...args),
    }),
  );
  const automationRuns = useStableFlow(() => createAutomationRuns(automationDeps));
  const launchAutomation = automationRuns.launch;

  const familiarCompletions = useStableFlow(() =>
    createFamiliarCompletions({
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
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
  const onInboxAppeared = automationRuns.inboxAppeared;

  const turnQueue = useStableFlow(
    (): TurnQueueDeps => ({
      sessions: () => sessionsRef.current,
      updateSessions: (update) => setSessions(update),
      updateSessionsNow: (update) => {
        updateSessionState(sessionsRef, setSessions, update);
      },
      submit: submission.send,
      enqueueHarnessEvent,
      flushHarnessEvents,
    }),
  );
  const queueActions = useStableFlow(() => createTurnQueueActions(turnQueue));

  useQueueDispatch(sessions, turnQueue, submission.submit);

  const usageLimits = useStableFlow(() => createUsageLimits(turnQueue));
  useUsageLimitTimers(sessions, turnQueue, usageLimits.resume);

  const secondOpinions = useStableFlow(() =>
    createSecondOpinionActions({
      beside: {
        ...placeSessionDeps,
        activeTabIdRef,
        appendTab: (tab, cwd) => tabLayout.append(tab, cwd),
      },
      submit: submission.send,
    }),
  );

  const unseenFinishedRef = useRef(unseenFinishedIds);
  unseenFinishedRef.current = unseenFinishedIds;

  useAutoContinue(sessions, turnControl.sessions, submission.send);

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
      stop: (sessionId) => turnActions.stop(sessionId),
      closeTab: (tabId) => tabClose.closeTab(tabId),
      persist: (session) => persistSession(session),
      updateTabs: (update) => setTabs(update),
    }),
  );

  useEscapeStop(
    useStableFlow(() => ({
      store: workspaceStore,
      sessions: () => sessionsRef.current,
      tabs: () => tabsRef.current,
      activeTabId: () => activeTabIdRef.current,
      terminalFocused: () => projectTerminalFocusedRef.current,
      stop: (sessionId: string) => turnActions.stop(sessionId),
    })),
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

  useOrchestrationSync(
    orchestrationRuns,
    sessions,
    tabs,
    activeTabId,
    useStableFlow(() => ({ setSessions, setTabs, setActiveTabId: (tabId: string) => setActiveTabId(tabId) })),
  );

  useOrchestratorBinding(
    useStableFlow(() => ({
      store: workspaceStore,
      sessionsRef,
      setSessions,
      stop: (sessionId: string, managed: boolean) => turnActions.stop(sessionId, managed),
      flushHarnessEvents,
      checkOpenWorktreeFiles: (path: string) =>
        checkOpenWorktreeFiles(worktreeDeps, path),
    })),
    submission.submit,
  );


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
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
      submitSession: submission.submit,
      saveDraft: (...args) => composerActions.saveDraft(...args),
      stopSession: turnActions.stop,
      removeSession: historyActions.remove,
      launchQuickSession: automationRuns.launchQuick,
    }),
  );
  useControlRequests(useStableFlow(() => createControlRequests(agentAppDeps)));

  const confirmingOrchestration = useRef(new Set<string>());
  const workerPanes = useStableFlow(() =>
    createWorkerPaneActions({
      store: workspaceStore,
      sessionsRef,
      setAutomationsViewOpen,
      focusOpenSession: (sessionId) => sessionOpeners.focusOpen(sessionId),
      selectHistorySession: (sessionId) => sessionOpeners.selectHistory(sessionId),
      ensureOpenSession: (sessionId) => sessionOpeners.ensureOpen(sessionId),
      closeLive: closeLiveAgentDeps,
    }),
  );
  useWorkerDetailPanes(
    tabs,
    workerDetailRequest,
    useStableFlow(() => ({
      store: workspaceStore,
      sessionsRef,
      projectCwd: () => projectCwdRef.current,
      selectTab: (tabId: string) => setActiveTabId(tabId),
      setComposerFocused: (focused: boolean) => setComposerFocused(focused),
    })),
  );
  const orchestrationWorkers = useMemo(
    () => ({
      selectedId: inspectedWorkerId,
      inspect: setInspectedWorkerId,
      openDetails: workerPanes.openDetails,
    }),
    [inspectedWorkerId],
  );
  const proposalActions = useStableFlow(() =>
    createProposalActions({
      sessionsRef,
      confirming: confirmingOrchestration,
      orchestrator,
      setSessions: (next) => setSessions(next),
      saveSession: (session) => upsertSession(session),
      submit: submission.send,
    }),
  );
  const orchestrationActions = useStableFlow(() => ({
    ...proposalActions,
    open: workerPanes.openSession,
    openAgents: workerPanes.openAgents,
  }));

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
        projectGitHint(sidebarCwd, projectBranches?.current ?? undefined),
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
  const rightPanelToggleRef = useRef<(() => void) | null>(null);
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
    onSelectHistorySession: sessionOpeners.selectHistory,
    railBadges,
  });
  const navigation = useStableFlow(() =>
    createNavigationActions({
      store: workspaceStore,
      insetLayout: () => insetLayoutRef.current,
      rightPanelToggle: () => rightPanelToggleRef.current,
      hasDirtyFiles: () => dirtyFilesRef.current.size > 0,
      reload: () => window.location.reload(),
      sessionList: sessionListDeps,
      project: {
        currentProject: () => projectCwdRef.current,
        selectProject: projectActions.select,
        noteStep: noteProjectStep,
      },
      openLocalSurface: (surface) => onOpenLocalSurface(surface),
    }),
  );

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
      activateTab: (tabId) => tabLayout.activate(tabId),
      closeFamiliarView: () => closeFamiliarView(),
      workspace: {
        closeTitleTab: (tabId) => tabClose.closeTitleTab(tabId),
        closeTabs: (ids, fallbackId) => tabClose.closeTabs(ids, fallbackId),
        closeEveryTab: (ids) => tabClose.closeEveryTab(ids),
        reorderTabs: tabActions.reorderTabs,
        closeFocused: newSessions.closeFocused,
        next: tabActions.next,
        prev: tabActions.prev,
        activate: tabActions.activateSlot,
        closeOtherTabs: () => tabClose.closeOtherTabs(),
        closeAllTabs: () => tabClose.closeAllTabs(),
      },
    }),
  );
  const displayedTabs = useStableFlow(() => createDisplayedTabs(displayedTabsDeps));
  const visibleTabShortcuts = useStableFlow(() =>
    createVisibleTabShortcuts(displayedTabsDeps, displayedTabs),
  );
  const onSelectTitleTab = displayedTabs.selectTitleTab;

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

  const onRemoteSnapshot = useStableFlow(() => createRemoteSnapshotSync(setSessions));
  const handlers = useStableFlow(
    (): WorkspaceHandlers => ({
      btw,
      composer: composerActions,
      composerCards,
      displayedTabs,
      familiarView,
      familiars: familiarActions,
      files: fileActions,
      history: historyActions,
      inbox: inboxActions,
      inboxAsk,
      linkedPanels,
      linkedUpdateCards,
      navigation,
      newSessions,
      prefetchSession: onPrefetchHistorySession,
      projects: projectActions,
      providerAccounts,
      queue: queueActions,
      remoteSnapshot: onRemoteSnapshot,
      secondOpinions,
      sessionOpeners,
      submission,
      surfaces,
      tabClose,
      tabs: tabActions,
      terminals,
      turns: turnActions,
      usageLimits,
      visibleTabs: visibleTabShortcuts,
      workerPanes,
      worktrees: worktreeActions,
    }),
  );
  const actions = useLatestRef(commandActions(handlers));
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

  const dockSlide = useDockSlide({
    dock: currentProjectDock,
    projectCwd,
    familiarCovers,
    insetLayout,
    paintTarget: terminals.dockPaintTarget,
    commitSize: terminals.setDockSize,
  });
  const dockClosingShown = dockSlide.closingShown;


  useFloatingFamiliar(sessions, familiarsSnap, familiarsEnabled, {
    open: (monoId) =>
      ensureFamiliarSession(monoId, {
        home: homeDir,
        load: sessionOpeners.ensureOpen,
        create: newDefaultSession,
        add: (created) => {
          sessionsRef.current = [...sessionsRef.current, created];
          setSessions(sessionsRef.current);
        },
      }),
    submit: submission.send,
    stop: turnActions.stop,
    approval: turnActions.approve,
    question: turnActions.answer,
    questionInteraction: turnActions.keepQuestionOpen,
    reveal: onOpenFamiliar,
    openArtifact: async (monoId, id) => {
      await onOpenFamiliar(monoId);
      const sessionId = findFamiliar(monoId)?.sessionId;
      if (sessionId) onOpenMonoArtifact(sessionId, id);
    },
    openFile: fileActions.open,
    resume: usageLimits.resume,
    create: () => createFamiliar().id,
  });

  const workspaceSwitchingSessionId = workspaceNavigation.pending ? active?.id : undefined;

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
  const familiarOverviewPanel =
    familiarViewFamiliar && familiarViewSession ? (
      <FamiliarOverviewPanel
        store={workspaceStore}
        familiar={familiarViewFamiliar}
        session={familiarViewSession}
        overview={familiarOverview}
        sessions={sessions}
        history={history}
        shownSession={{
          session: familiarShownSessionPane,
          active: familiarShownSessionActive,
          composerFocused,
          composerFocusToken,
          workspaceSwitchingSessionId,
        }}
      />
    ) : null;

  const chrome = useWorkspaceChrome(workspaceStore, {
    insetLayout,
    automationsViewOpen,
    rightPanelOpen,
    rightPanelClosing,
    activeAppView,
    sidebarCwd,
  });
  useRightPanelSlide(
    rightPanelOpen,
    rightPanelClosing,
    chrome.insetRightPanelShown,
    rightPanelRef,
    setRightPanelClosing,
  );
  rightPanelToggleRef.current =
    chrome.showRightPanelToggle && !(familiarCovers && familiarViewFamiliar) && !activeAppView
      ? onToggleRightPanel
      : null;
  const workspaceTitleBar = (
    <WorkspaceTitleBar
      store={workspaceStore}
      tabs={titleTabs}
      inset={insetLayout}
      cwd={sidebarCwd}
      gitCwd={gitCwd}
      familiarSession={familiarViewSession}
      activeAppView={activeAppView}
      compactRail={chrome.compactTitleNavigation}
      showRightPanelToggle={chrome.showRightPanelToggle}
      rightPanelOpen={rightPanelOpen}
      onToggleRightPanel={onToggleRightPanel}
      onSettingsHeaderHost={setSettingsHeaderHost}
    />
  );

  const sessionSidebar = (
    <WorkspaceSidebar
      store={workspaceStore}
      automationsViewOpen={automationsViewOpen}
      cwd={sidebarCwd}
      gitCwd={gitCwd}
      liveSessions={sessions}
      activeTab={activeTab}
      activeSession={active}
      tabWorkspace={tabWorkspace}
      workspaceSwitch={workspaceNavigation}
      unseenFamiliarReplies={familiarReplies.counts}
      tab={sidebarTab}
      onTabChange={setSidebarTab}
      rightPanel={{
        host: rightPanelHost,
        open: rightPanelOpen || rightPanelClosing,
        tab: rightPanelTab,
        onTabChange: showRightPanel,
      }}
      sessions={sidebarHistory}
      busySessionIds={busySessionIds}
      activeSessionId={activeSessionId}
      reminders={sessionReminders.reminders}
      onSetReminders={sessionReminders.schedule}
      onCancelReminders={sessionReminders.cancel}
      textHarness={pickTextHarness(active?.harness)}
      liveAgents={liveAgents}
      onOpenKnowledge={railSurfaces.knowledge ? onOpenKnowledge : undefined}
      knowledgeActive={localSurface === "knowledge"}
      automationsActive={automationsSurfaceOpen}
      railExtraActions={localSurfaceRailActions}
      localSurfaces={{
        active: localSurface,
        visible: railSurfaces,
        onOpen: onOpenLocalSurface,
        badges: railBadges,
      }}
      titleBarAbove={chrome.sidebarTitleBarAbove}
      inset={insetLayout}
      unseenFinishedIds={unseenFinishedIds}
      inboxUnseen={inboxUnseen}
      linkedSessionUpdateIds={linkedSessionUpdateIds}
    />
  );

  const usageFooter = chrome.usageFooterShown ? (
    <WorkspaceUsageFooter
      store={workspaceStore}
      pressureSlot={setPressureChipHost}
      source={usageSource}
      activeTab={activeTab}
      inset={insetLayout}
    />
  ) : null;

  return (
    <SessionStateContext.Provider value={sessionState}>
    <WorkspaceHandlersContext.Provider value={handlers}>
    <OrchestrationActions.Provider value={orchestrationActions}>
      <OrchestrationWorkers.Provider value={orchestrationWorkers}>
        <WorkspaceLayout
          store={workspaceStore}
          insetLayout={insetLayout}
              chrome={chrome}
          titleBar={workspaceTitleBar}
          sidebar={sessionSidebar}
          onInsetRailHost={setInsetRailHost}
          dockGridRef={dockSlide.gridRef}
          docks={
            <ProjectTerminalDocks
              store={workspaceStore}
              closingShown={dockClosingShown}
              onSizePaint={dockSlide.paintSize}
              onSizeCommit={dockSlide.commitSize}
            />
          }
          panes={
            <>
              <WorkspaceTabPanes
                store={workspaceStore}
                workspaceSwitchingSessionId={workspaceSwitchingSessionId}
                sessions={sessions}
                activeSessionId={active?.id}
                composerFocused={composerFocused}
                composerFocusToken={composerFocusToken}
                transcriptPool={transcriptPool}
              />
              <FamiliarSessionPanes
                store={workspaceStore}
                workspaceSwitchingSessionId={workspaceSwitchingSessionId}
                sessions={sessions}
                insetLayout={insetLayout}
                familiar={familiarViewFamiliar}
                composerFocused={composerFocused}
                composerFocusToken={composerFocusToken}
                shownSessionActive={familiarShownSessionActive}
                onOpenArtifact={onOpenMonoArtifact}
                activityTurnId={familiarOverview.activityShownTurnId}
                launchedSessions={familiarOverview.launchedSessions}
              />
            </>
          }
          linkedPanels={
            <LinkedWorkItemPanels
              store={workspaceStore}
              shownSessionId={
                chrome.surfaceOpen || familiarCovers
                  ? undefined
                  : activeLinkedWorkItemPanel?.sessionId
              }
              repairSessions={repairSessions}
            />
          }
          familiarOverview={familiarCovers ? familiarOverviewPanel : null}
          familiarSettings={<FamiliarSettingsPanel store={workspaceStore} session={familiarViewSession} />}
          appViews={
            <WorkspaceAppViews
              store={workspaceStore}
              insetLayout={insetLayout}
              openAppViews={openAppViews}
                      automationsOpen={automationsSurfaceOpen}
              besideRail={chrome.appViewBesideRail}
              compactRail={chrome.appViewCompactRail}
              gitCwd={gitCwd}
              sidebarCwd={sidebarCwd}
              scopeProject={appViewScope}
              history={projectHistory}
              sessions={sessions}
              automationsFocusId={automationsFocusId}
              inboxAsk={
                <InboxAskPanes
                  store={workspaceStore}
                  sessions={sessions}
                  composerFocused={composerFocused}
                  composerFocusToken={composerFocusToken}
                  workspaceSwitchingSessionId={workspaceSwitchingSessionId}
                />
              }
              localSurfaces={
                <LocalSurfaceViews
                  surface={localSurface}
                  besideRail={chrome.appViewBesideRail}
                  compactRail={chrome.appViewCompactRail}
                  projectPaths={recents.map((project) => project.path)}
                  projectCwd={projectCwd}
                  onClose={onLeaveLocalSurface}
                  onToggleSidebar={navigation.toggleSidebar}
                  onOpenSession={onOpenHomeSession}
                  onOpenAutomation={onOpenHomeAutomation}
                  onOpenAutomations={surfaces.openAutomations}
                  onOpenUsage={navigation.openUsage}
                  onOpenInbox={surfaces.openInbox}
                  taskBoard={taskBoard}
                />
              }
              inbox={{ sessions: inboxRelatedSessions, repairSessions }}
              automations={{
                onFocusAutomationConsumed: onAutomationsFocusConsumed,
                onLaunch: (automation, run) => launchAutomation(automation, run, true),
              }}
            />
          }
          settings={
            <WorkspaceSettings
              store={workspaceStore}
              cwd={sidebarCwd}
              sessions={sidebarHistory}
              liveSessions={sessions}
              headerHost={insetLayout ? settingsHeaderHost : undefined}
            />
          }
          usageFooter={usageFooter}
          rightPanel={
            <InsetRightPanel
              shown={chrome.insetRightPanelShown}
              closing={rightPanelClosing}
              resize={rightPanelResize}
              onPane={setRightPanelRef}
              onHost={setRightPanelHost}
            />
          }
          overlays={
            <>
              <WorkspacePickerDialogs store={workspaceStore} cwd={filesCwd} openPaths={openFilePaths} />
              <WorkspaceNotices
                pressure={{
                  sessions: sessionsRef,
                  onPressureChange: transcriptPool.setResourcePressure,
                  chipHost: pressureChipHost,
                  insetChip: insetLayout,
                }}
                approvalNotices={hiddenApprovalToasts}
                reminders={sessionReminders}
              />
              <WorkspaceDialogs store={workspaceStore} />
            </>
          }
        />
        <TranscriptPoolOutlet pool={transcriptPool} />
      </OrchestrationWorkers.Provider>
    </OrchestrationActions.Provider>
    </WorkspaceHandlersContext.Provider>
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
