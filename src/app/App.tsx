import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { useIsolatedTerminalPanes, useTabVisitsSync } from "./workspace/hooks/tabs/use-tab-effects";
import {
  useActiveHarnessCatalog,
  useBtwAbortClosed,
  useForegroundFlush,
  useHarnessIdlePark,
  useWarmActiveSkills,
} from "./workspace/hooks/harness/use-harness-effects";
import { ciRepairSessions } from "@/features/inbox/model/ci-repair-sessions";
import { createHarnessEventPipeline } from "./workspace/flows/harness-events/harness-event-pipeline";
import { isForegroundSession } from "./workspace/flows/harness-events/foreground-session";
import {
  useProjectFilePrefetch,
  useProjectHistory,
  useRemoteHistoryRerender,
} from "./workspace/hooks/project-data/use-project-data-effects";
import { createSessionPersistence } from "./workspace/flows/session-history/session-persistence";
import { createSessionLoader } from "./workspace/flows/session-history/session-loader";
import { useIdleSessionDetach } from "./hooks/use-idle-session-detach";
import { useWorkspaceNavigation } from "./hooks/use-workspace-navigation";
import { activeWorkspaceTab } from "./model/active-workspace-tab";
import type { SettingsReturnView } from "./model/settings-return/types";

import { useInboxActivity } from "@/features/inbox/hooks/use-inbox-unseen";
import { FamiliarSettingsPanel } from "./workspace/ui/familiars/FamiliarSettingsPanel";
import { FamiliarOverviewPanel } from "./workspace/ui/familiars/FamiliarOverviewPanel";
import {
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
import { noteProjectStep } from "./shell/Sidebar";
import { createWorkspaceStore } from "./workspace/store/create-workspace-store";
import { useWorkspaceActions } from "./workspace/hooks/use-workspace-actions";
import { useWorkspaceField } from "./workspace/hooks/use-workspace-field";
import { shownFamiliarSession } from "./workspace/store/familiars-slice";
import { useStableFlow } from "./workspace/hooks/use-stable-flow";
import type { WorkspaceFlowCore } from "./workspace/hooks/flows/workspace-flow-core";
import { useTabFlows } from "./workspace/hooks/flows/use-tab-flows";
import { useSessionOpenerFlows } from "./workspace/hooks/flows/use-session-opener-flows";
import { useHistoryFlows } from "./workspace/hooks/flows/use-history-flows";
import { useProjectFlows } from "./workspace/hooks/flows/use-project-flows";
import { useSubmissionFlows } from "./workspace/hooks/flows/use-submission-flows";
import { useTurnQueueFlows } from "./workspace/hooks/flows/use-turn-queue-flows";
import { useOrchestrationFlows } from "./workspace/hooks/flows/use-orchestration-flows";
import { useTitleTabFlows } from "./workspace/hooks/flows/use-title-tab-flows";
import { useSurfaceFlows } from "./workspace/hooks/flows/use-surface-flows";
import { WorkspaceHandlersContext } from "./workspace/handlers/workspace-handlers";
import { useWorkerDetailPanes } from "./workspace/hooks/use-worker-detail-panes";
import { createInboxActions } from "./workspace/flows/inbox/inbox-actions";
import { projectGitHint } from "./workspace/hooks/sidebar/sidebar-rows";
import { useFamiliarOverviewData } from "./workspace/hooks/familiars/use-familiar-overview-data";
import { openOverviewDocument } from "./workspace/flows/familiars/familiar-overview";
import { useFamiliarOverviewSync } from "./workspace/hooks/familiars/use-familiar-overview-sync";
import { useFamiliarTabMigration } from "./workspace/hooks/familiars/use-familiar-tab-migration";
import { useFamiliarTurnClose } from "./workspace/hooks/familiars/use-familiar-turn-close";
import { createFamiliarView } from "./workspace/flows/familiars/familiar-view";
import { createBtw } from "./workspace/flows/btw/btw-actions";
import type { InboxDeps } from "./workspace/flows/inbox/inbox-deps";
import { inboxRelatedSessions as relatedInboxSessions } from "./workspace/flows/inbox/inbox-related-sessions";
import { createLinkedUpdateCards } from "./workspace/flows/linked-work-items/linked-update-card";
import { createLinkedWorkItemPanels } from "./workspace/flows/linked-work-items/linked-work-item-panel";
import { useAddNoteToChat } from "./workspace/hooks/use-add-note-to-chat";
import { useAddToChat } from "./workspace/hooks/use-add-to-chat";
import { useAutomationSchedule } from "./workspace/hooks/use-automation-schedule";
import { useOrchestratorBinding } from "./workspace/hooks/use-orchestrator-binding";
import { useOrchestrationSync } from "./workspace/hooks/use-orchestration-sync";
import { useRightPanel, useRightPanelSlide } from "./workspace/hooks/use-right-panel";
import { useWorkspaceChrome } from "./workspace/ui/layout/use-workspace-chrome";
import { useInsetLayoutShell } from "./workspace/ui/layout/use-inset-layout-shell";
import { useChromeResets } from "./workspace/ui/layout/use-chrome-resets";
import { useTitleTabState } from "./workspace/hooks/use-title-tab-state";
import { commandActions } from "./workspace/hooks/commands/command-actions";
import type { CommandDeps } from "./workspace/hooks/commands/command-deps";
import { useCommandRunner } from "./workspace/hooks/commands/use-command-runner";
import { useMenuCommands } from "./workspace/hooks/commands/use-menu-commands";
import { useNativeKeybindings } from "./workspace/hooks/commands/use-native-keybindings";
import { useWorkspaceKeys } from "./workspace/hooks/commands/use-workspace-keys";
import { useLatestRef } from "./workspace/hooks/use-latest-ref";
import { useControlRequests } from "./workspace/hooks/use-control-requests";
import { titleTabList } from "./workspace/title-tabs/title-tab-list";
import { titleTabsEqual } from "./workspace/title-tabs/title-tabs-equal";
import type {
  DisplayedTabNavigation,
  VisibleTabs,
} from "./workspace/title-tabs/displayed-tabs-deps";
import { useSettingsOpenEvents } from "./workspace/hooks/use-settings-open-events";
import { useQueueDispatch } from "./workspace/hooks/use-queue-dispatch";
import { useUsageLimitTimers } from "./workspace/hooks/use-usage-limit-timers";
import type { HarnessReplyDeps } from "./workspace/flows/turn-control/harness-replies";
import { createTurnControlActions } from "./workspace/flows/turn-control/turn-control-actions";
import type { TurnControlDeps } from "./workspace/flows/turn-control/turn-control-deps";
import { useAutoContinue } from "./workspace/hooks/use-auto-continue";
import { useEscapeStop } from "./workspace/hooks/use-escape-stop";
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
  cancelHarnessTurn,
  migrateFamiliarCodexSession,
  isLiveHarness,
  pickTextHarness,
  probeHarnessAvailability,
  refreshHarnessCatalogs,
  registerBuiltinHarnesses,
  startHarnessBridge,
  stopHarnessSession,
  stopHarnessTextPrompts,
} from "@/integrations/harness";

import {
  focusedFileTab,
  isFilesystemTab,
  leafIds,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";




import type { WindowTransferPayload } from "./model/window-transfer";

import {
  finishSessionTurn,
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

import { useInputNotifications } from "@/features/notifications/hooks/use-input-notifications";
import { useSessionReminders } from "@/features/notifications/hooks/use-session-reminders";
import { hiddenApprovalNotices } from "@/features/notifications/model/approval-toast";
import { syncDockBadge } from "@/features/notifications/model/dock-badge";
import {
  useDockBadge,
  useNotificationPermissionProbe,
} from "./workspace/hooks/notifications/use-notification-effects";
import { setWindowFocused } from "@/features/notifications/model/notifications";
import { useQuickComposerLaunches } from "@/features/quick-composer/hooks/use-quick-composer-launches";
import {
  getSession,
  readSession,
  replaceInFlightSessions,
  saveWorkspaceSnapshot,
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
import { useFamiliarHabits } from "./hooks/use-familiar-habits";
import { useDockSlide } from "./workspace/hooks/use-dock-slide";
import { useFloatingFamiliar } from "./hooks/use-floating-familiar";
import { ensureFamiliarSession } from "@/features/familiars/model/familiar-workspace";
import {
  TranscriptPool,
  TranscriptPoolOutlet,
} from "@/features/sessions/ui/TranscriptPool";
import {
  remoteTabCwd,
} from "@/features/connections/model/connections";
import {
  remotePath,
  remoteProjectFor,
  remoteSessionGitCwd,
} from "@/features/connections/model/remote-projects";
import {
  isBusySession,
  openSessionIds,
} from "./model/session-id-sets";
import { useProviderSignInPrompt } from "./workspace/hooks/use-provider-sign-in-prompt";
import { useSessionIdSet } from "./workspace/hooks/use-session-id-set";
import { WorkspaceAppViews } from "./workspace/ui/app-views/WorkspaceAppViews";
import { useAppViewWarmup } from "./workspace/ui/app-views/use-app-view-warmup";
import {
  useInboxAskFocus,
  useInboxLinkedSessions,
  useLinkedPanelPrune,
} from "./workspace/hooks/inbox/use-inbox-effects";
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
import { LocalSurfaceViews } from "./ui/LocalSurfaceViews";


import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";

import {
  loadCloseToTray,
  loadFamiliarsEnabled,
  subscribeFamiliarsEnabled,
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
    setHistory,
    setFilePickerOpen,
    setSearchViewOpen,
    setInboxViewOpen,
    setNotesViewOpen,
    setInspectedWorkerId,
    setSettingsOpen,
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
  const onOpenMonoArtifact = useCallback(
    (_sessionId: string, id: string) => openOverviewDocument(workspaceStore, id),
    [],
  );
  useFamiliarOverviewSync(workspaceStore, sessionsRef, setSessions);
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
  const currentProjectDock = findProjectTerminal(projectTerminals, projectCwd);
  const searchViewOpen = useWorkspaceField(workspaceStore, "searchViewOpen");
  const inboxViewOpen = useWorkspaceField(workspaceStore, "inboxViewOpen");
  const linkedWorkItemPanels = useWorkspaceField(workspaceStore, "linkedWorkItemPanels");
  const inboxAskPortal = useWorkspaceField(workspaceStore, "inboxAskPortal");
  const notesViewOpen = useWorkspaceField(workspaceStore, "notesViewOpen");
  const localSurfaces = useLocalSurfaceState();
  const {
    localSurface,
    automationsSurfaceOpen,
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
  const setInsetRailHost = useInsetLayoutShell(insetLayout);
  const settingsReturnViewRef = useRef<SettingsReturnView>({
    search: false,
    inbox: false,
    notes: false,
    automations: false,
    localSurface: null,
  });
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
  const dirtyFiles = useWorkspaceField(workspaceStore, "dirtyFiles");
  const history = useWorkspaceField(workspaceStore, "history");
  useRemoteHistoryRerender();
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
  const projectTerminalsRef = useRef(projectTerminals);
  projectTerminalsRef.current = projectTerminals;
  const projectTerminalFocusedRef = useRef(projectTerminalFocused);
  projectTerminalFocusedRef.current = projectTerminalFocused;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  useLayoutEffect(() => commitTabSwitch(activeTabId), [activeTabId]);

  useFamiliarTabMigration({
    store: workspaceStore,
    tabs,
    sessions,
    activeTabId,
    projectCwd,
    tabsRef,
    sessionsRef,
    setSessions,
  });

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
  useBtwAbortClosed(btw, sessions);

  useEffect(
    () => () => {
      btw.abortAll();
      void stopHarnessTextPrompts();
    },
    [],
  );

  useAppViewWarmup(workspaceStore, notesEnabled);

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
  useHarnessIdlePark(harnessEvents);
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

  useLinkedPanelPrune(workspaceStore, tabs);

  const sessionDefaults = active ?? sessions[0];
  const sessionDefaultsRef = useLatestRef(sessionDefaults);
  const activeTabRef = useLatestRef(activeTab);

  useWarmActiveSkills(active);

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

  useActiveHarnessCatalog(active?.harness);

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

  useNotificationPermissionProbe();
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

  useDockBadge(sessions);

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

  useForegroundFlush(flushForegroundHarnessEvents, {
    activeTabId,
    familiarViewId,
    inboxViewOpen,
    inboxAskSessionId: inboxAskPortal?.sessionId,
    shownFamiliarSessionId,
    searchViewOpen,
    notesViewOpen,
    automationsViewOpen,
    settingsOpen,
  });

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

  const refreshHistory = useProjectHistory(workspaceStore, sidebarCwd, sidebarCwdRef);

  useInboxLinkedSessions(workspaceStore, inboxViewOpen);

  useProjectFilePrefetch(gitCwd);

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

  useIsolatedTerminalPanes(workspaceStore, tabs);

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
      sessionsRef, setSessions, tabsRef, setTabs, activeTabIdRef, projectCwdRef, sidebarCwdRef, gitCwdRef,
      sessionDefaultsRef, activeTabRef, insetLayoutRef,
      persistence: sessionPersistence,
      loader: sessionLoader,
      loadedSessionCache, openingSessionIds, removingSessionIds,
      switchingWorktrees, removingWorktreePaths, workspacePins, turnGen, familiarView,
      navigation: workspaceNavigation,
      setActiveTabId: setActiveTabIdState,
      selectTab: setActiveTabId,
      setComposerFocused, setAutomationsViewOpen, setSidebarTab, leaveCoveringFamiliar,
      refreshHistory, stopSessionForRemoval, projectOfTab, tabWorkspace,
    }),
  );
  const tabFlows = useTabFlows(flowCore, { terminalCwdRef, displayedTabNavigation });
  const { tabLayout, terminals, newSessions } = tabFlows;

  useTabVisitsSync(tabVisits, tabs, activeTabId);

  const inboxActions = useStableFlow(() => createInboxActions(inboxDeps));
  useAddNoteToChat(inboxActions.addNoteToChat);

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

  const deckProjectTabsRef = useLatestRef(deckProjectTabs);
  const openerFlows = useSessionOpenerFlows(flowCore, {
    tabFlows,
    visits: tabVisits,
    linkedUpdateCards,
    linkedUpdatesRef: linkedSessionUpdatesRef,
    navigationIdsRef: sessionNavigationIdsRef,
    deckTabsRef: deckProjectTabsRef,
  });
  const { tabActions, sessionOpeners } = openerFlows;

  useInboxAskFocus(inboxAskPortal, inboxViewOpen, setComposerFocused);

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
  const surfaceFlows = useSurfaceFlows(flowCore, {
    tabActions,
    sessionOpeners,
    localSurfaces,
    settingsReturnView: settingsReturnViewRef,
    rememberAppView,
    familiarsEnabledRef,
    linkedUpdateCards,
    dismissDueReminder: (sessionId) => sessionRemindersRef.current.dismissDue(sessionId),
  });
  const { surfaces, reminders } = surfaceFlows;
  useSettingsOpenEvents(surfaces.openSettings, surfaces.openRemoteProjectDialog);
  const sessionReminders = useSessionReminders(
    surfaces.openConversation,
    reminders.ensureSaved,
    sessions
      .filter((session) => !session.inboxAsk)
      .map((session) => session.id),
  );
  const sessionRemindersRef = useLatestRef(sessionReminders);

  const historyFlows = useHistoryFlows(flowCore, {
    tabFlows,
    deleteConfirmationPending,
    automationsViewOpenRef,
  });
  const { worktreeActions, historyActions } = historyFlows;

  const projectFlows = useProjectFlows(flowCore, {
    tabFlows,
    worktreeActions,
    projectTerminalsRef,
    setSidebarTabSelection,
    readProjectReturnMemory,
    editorNavigationToken,
  });
  const { projectActions, fileActions, composerActions } = projectFlows;

  const submissionFlows = useSubmissionFlows(flowCore, {
    activeSessionIdRef,
    projectLocationSyncs,
    editedResends,
    enqueueHarnessEvent,
    flushHarnessEvents,
    tabFlows,
    sessionOpeners,
    reminders,
    projectActions,
    composerActions,
    noteReply: familiarReplies.noteReply,
  });
  const { submission, familiarChat, familiarHabitHost, automationRuns, familiarCompletions } = submissionFlows;
  useFamiliarHabits(familiarHabitHost);

  const launchAutomation = automationRuns.launch;

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
  const onInboxAppeared = automationRuns.inboxAppeared;

  const turnQueueFlows = useTurnQueueFlows(flowCore, {
    enqueueHarnessEvent,
    flushHarnessEvents,
    tabFlows,
    place: openerFlows.place,
    submission,
    activeSessionId: () => newChatDefaultsRef.current.active?.id,
  });
  const { turnQueue, usageLimits } = turnQueueFlows;

  useQueueDispatch(sessions, turnQueue, submission.submit);
  useUsageLimitTimers(sessions, turnQueue, usageLimits.resume);

  const unseenFinishedRef = useRef(unseenFinishedIds);
  unseenFinishedRef.current = unseenFinishedIds;

  useAutoContinue(sessions, turnControl.sessions, submission.send);

  const orchestrationFlows = useOrchestrationFlows(flowCore, {
    flushHarnessEvents,
    submission,
    automationRuns,
    familiarCompletions,
    worktreeDeps: historyFlows.worktreeDeps,
    historyActions,
    turnActions,
    tabFlows,
    sessionOpeners,
    composerActions,
    board: () => taskBoardRef.current,
    setDismissedLiveAgentIds,
    unseenFinishedRef,
    projectTerminalFocusedRef,
  });
  const { orchestratorBinding, workerPanes, orchestrationActions } = orchestrationFlows;

  useEscapeStop(orchestrationFlows.escapeStop);

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

  useOrchestrationSync(orchestrationRuns, sessions, tabs, activeTabId, orchestrationFlows.orchestrationSync);

  useOrchestratorBinding(orchestratorBinding, submission.submit);
  useControlRequests(orchestrationFlows.controlRequests);

  useWorkerDetailPanes(tabs, workerDetailRequest, orchestrationFlows.workerDetailPanes);

  const orchestrationWorkers = useMemo(
    () => ({
      selectedId: inspectedWorkerId,
      inspect: setInspectedWorkerId,
      openDetails: workerPanes.openDetails,
    }),
    [inspectedWorkerId, workerPanes.openDetails],
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
  const { navigation, displayedTabs, handlers } = useTitleTabFlows(flowCore, {
    navigation: displayedTabNavigation,
    setOpenAppViews,
    setOpenFamiliarTabs,
    setTitleTabOrder,
    openLocalSurface: (surface) => onOpenLocalSurface(surface),
    flows: {
      tab: tabFlows,
      openers: openerFlows,
      surface: surfaceFlows,
      history: historyFlows,
      project: projectFlows,
      submission: submissionFlows,
      turnQueue: turnQueueFlows,
      orchestration: orchestrationFlows,
    },
    own: { btw, turns: turnActions, inbox: inboxActions, linkedPanels, linkedUpdateCards },
    noteProjectStep,
    rightPanelToggleRef,
    visibleTabsRef,
  });

  useChromeResets({
    store: workspaceStore,
    sidebarTab,
    setSidebarTab,
    dockVisible: !!currentProjectDock?.open,
  });

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


  displayedTabNavigation.current = {
    tabs: insetLayout ? titleTabs : [],
    activeId: settingsOpen
      ? ""
      : familiarCovers
        ? (familiarViewTabId ?? "")
        : activeAppView
          ? appViewTabId(activeAppView)
          : activeTabId,
    select: displayedTabs.selectTitleTab,
  };

  visibleTabsRef.current = {
    insetLayout,
    familiarTabId: familiarCovers ? familiarViewTabId : undefined,
    activeAppView,
    activeTabId,
    titleTabs,
  };

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
