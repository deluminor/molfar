import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { SessionStateContext } from "@/features/sessions/model/session-state-store";
import { useIsolatedTerminalPanes } from "./workspace/hooks/tabs/use-tab-effects";
import {
  useActiveHarnessCatalog,
  useBtwAbortClosed,
  useForegroundFlush,
  useHarnessIdlePark,
  useWarmActiveSkills,
} from "./workspace/hooks/harness/use-harness-effects";
import {
  useProjectFilePrefetch,
  useProjectHistory,
} from "./workspace/hooks/project-data/use-project-data-effects";
import { useIdleSessionDetach } from "./hooks/use-idle-session-detach";
import { useWorkspaceNavigation } from "./hooks/use-workspace-navigation";
import { activeWorkspaceTab } from "./model/active-workspace-tab";
import { workspaceCwds } from "./model/workspace-cwds";
import { useInboxActivity } from "@/features/inbox/hooks/use-inbox-unseen";
import { FamiliarSettingsPanel } from "./workspace/ui/familiars/FamiliarSettingsPanel";
import { FamiliarOverviewPanel } from "./workspace/ui/familiars/FamiliarOverviewPanel";
import { useProjectBranches } from "@/features/source-control/hooks/use-project-branches";
import { homeDir } from "@/platform/tauri/fs";
import { noteProjectStep } from "./shell/Sidebar";
import { useStableFlow } from "./workspace/hooks/use-stable-flow";
import { useTitleTabFlows } from "./workspace/hooks/flows/use-title-tab-flows";
import { useSessionStorage } from "./workspace/hooks/flows/use-session-storage";
import { useHarnessTurnFlows } from "./workspace/hooks/flows/use-harness-turn-flows";
import { useInboxFlows } from "./workspace/hooks/flows/use-inbox-flows";
import { useWorkspaceFlows } from "./workspace/hooks/workspace-flows/use-workspace-flows";
import { useWorkspaceCore } from "./workspace/hooks/core/use-workspace-core";
import type { WorkspaceProps } from "./workspace/hooks/core/types";
import { WorkspaceHandlersContext } from "./workspace/handlers/workspace-handlers";
import { useSidebarTab } from "./workspace/hooks/sidebar/use-sidebar-tab";
import { useLiveAgentsView } from "./workspace/hooks/sidebar/use-live-agents-view";
import { useSidebarHistoryView } from "./workspace/hooks/sidebar/use-sidebar-history-view";
import { useApprovalToastsView } from "./workspace/hooks/notifications/use-approval-toasts-view";
import { useFamiliarOverviewData } from "./workspace/hooks/familiars/use-familiar-overview-data";
import { createFamiliarView } from "./workspace/flows/familiars/familiar-view";
import { useAddToChat } from "./workspace/hooks/use-add-to-chat";
import { useRightPanelSlide } from "./workspace/hooks/use-right-panel";
import { useWorkspaceChrome } from "./workspace/ui/layout/use-workspace-chrome";
import { useChromeResets } from "./workspace/ui/layout/use-chrome-resets";
import { commandActions } from "./workspace/hooks/commands/command-actions";
import type { CommandDeps } from "./workspace/hooks/commands/command-deps";
import { useCommandRunner } from "./workspace/hooks/commands/use-command-runner";
import { useMenuCommands } from "./workspace/hooks/commands/use-menu-commands";
import { useNativeKeybindings } from "./workspace/hooks/commands/use-native-keybindings";
import { useWorkspaceKeys } from "./workspace/hooks/commands/use-workspace-keys";
import { useLatestRef } from "./workspace/hooks/use-latest-ref";
import { useTitleTabsView } from "./workspace/title-tabs/use-title-tabs-view";
import { createTabVisits } from "./workspace/flows/tabs/tab-visits";
import { WorkspaceSidebar } from "./workspace/ui/WorkspaceSidebar";
import { WorkspaceTitleBar } from "./workspace/ui/WorkspaceTitleBar";
import { OrchestrationActions, OrchestrationWorkers } from "@/features/orchestration/ui/orchestration-actions";
import {
  pickTextHarness,
  registerBuiltinHarnesses,
} from "@/integrations/harness";
import { focusedFileTab, leafIds } from "@/features/workspace/model/layout";
import { newDefaultSession } from "@/features/sessions/model/session";
import { useInputNotifications } from "@/features/notifications/hooks/use-input-notifications";
import { useDockBadge, useNotificationPermissionProbe } from "./workspace/hooks/notifications/use-notification-effects";
import { useUnseenFinishedSessions } from "@/features/sessions/hooks/use-unseen-finished-sessions";
import { useUnseenReplyCounts } from "@/features/sessions/hooks/use-unseen-reply-counts";
import {
  createFamiliar,
  findFamiliar,
  listFamiliars,
  familiarForSession,
} from "@/features/familiars/model/familiar";
import { useDockSlide } from "./workspace/hooks/use-dock-slide";
import { useFloatingFamiliar } from "./hooks/use-floating-familiar";
import { ensureFamiliarSession } from "@/features/familiars/model/familiar-workspace";
import { TranscriptPoolOutlet } from "@/features/sessions/ui/TranscriptPool";
import { isBusySession } from "./model/session-id-sets";
import { useProviderSignInPrompt } from "./workspace/hooks/use-provider-sign-in-prompt";
import { useSessionIdSet } from "./workspace/hooks/use-session-id-set";
import { WorkspaceAppViews } from "./workspace/ui/app-views/WorkspaceAppViews";
import { useAppViewWarmup } from "./workspace/ui/app-views/use-app-view-warmup";
import {
  useInboxLinkedSessions,
  useLinkedPanelPrune,
} from "./workspace/hooks/inbox/use-inbox-effects";
import { useInboxView } from "./workspace/hooks/inbox/use-inbox-view";
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
import { LocalSurfaceViews } from "./ui/LocalSurfaceViews";
import { useProjectReturnMemory } from "./workspace/hooks/lifecycle/use-project-return-memory";
import {
  useWindowUnload,
  useWorkspaceTeardown,
} from "./workspace/hooks/lifecycle/use-window-unload";
import { useWindowClose } from "./workspace/hooks/lifecycle/use-window-close";
import { useFamiliarThreadMigration } from "./workspace/hooks/lifecycle/use-familiar-thread-migration";
import { useHarnessBootRefresh } from "./workspace/hooks/lifecycle/use-harness-boot-refresh";
import {
  useVisibilityFlush,
  useWindowFocus,
} from "./workspace/hooks/lifecycle/use-window-focus";
import {
  useDefaultProject,
  useProjectLocations,
} from "./workspace/hooks/lifecycle/use-boot-effects";
import {
  useImportedSessionMarks,
  useSessionAutosave,
} from "./workspace/hooks/lifecycle/use-session-autosave";
import {
  useInFlightSnapshot,
  useWorkspaceSnapshotAutosave,
} from "./workspace/hooks/lifecycle/use-workspace-autosave";

// Register capabilities before composer hooks choose their discovery strategy.
registerBuiltinHarnesses();

type AppProps = WorkspaceProps;

export default function App(props: AppProps) {
  return (
    <Suspense fallback={null}>
      <Workspace {...props} />
    </Suspense>
  );
}

function Workspace(props: AppProps) {
  const { windowTransfer = null, resumed = null } = props;
  const core = useWorkspaceCore(props);
  const {
    workspaceStore, setActiveTabIdState, setFilePickerOpen, setSearchViewOpen, setInboxViewOpen, setNotesViewOpen,
    setSettingsOpen, projectCwd, recents, sessions, setSessions, sessionsRef, sessionState, switchingWorktrees, tabs,
    projectTerminals, lastDockSide, lastDockSideRef, activeTabId, familiarViewId, onOpenMonoArtifact,
    familiarShownSessionFocused, shownFamiliarSessionId, composerFocused, setComposerFocused, composerFocusToken,
    setComposerFocusToken, tabProjectsRef, displayedTabNavigation, visibleTabsRef, currentProjectDock, searchViewOpen,
    inboxViewOpen, inboxAskPortal, notesViewOpen, localSurfaces, localSurface, automationsSurfaceOpen,
    automationsFocusId, automationsViewOpen, setAutomationsViewOpen, railSurfaces, activeAppView, orchestrationRuns,
    notesEnabled, liveAgentsEnabled, settingsOpen, insetLayout, settingsHeaderHost, setSettingsHeaderHost,
    insetLayoutRef, rightPanel, setInsetRailHost, familiarsEnabled, familiarsSnap, openAppViews, setOpenAppViews,
    setOpenFamiliarTabs, titleTabOrder, setTitleTabOrder, shownFamiliarTabs, dirtyFiles, history, storedLinkedSessions,
    tabsRef, projectTerminalsRef, projectTerminalFocusedRef, activeTabIdRef, projectWorktree, workspacePins,
    tabWorkspace, keepWorkspaceTab, projectCwdRef, foregroundSurfaceRef, transcriptPool, searchViewOpenRef,
    inboxViewOpenRef, notesViewOpenRef, automationsViewOpenRef, settingsOpenRef, turnGen, skipForgetSessionIds,
  } = core;
  const {
    host: rightPanelHost, setHost: setRightPanelHost, open: rightPanelOpen, tab: rightPanelTab, closing: rightPanelClosing,
    setClosing: setRightPanelClosing, show: showRightPanel, toggle: onToggleRightPanel, resize: rightPanelResize,
    paneRef: rightPanelRef, setPane: setRightPanelRef,
  } = rightPanel;
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
  /** A Familiar hides the terminal, so reaching for one leaves it. */
  const leaveCoveringFamiliar = useCallback(() => {
    if (workspaceStore.getState().familiarViewId) closeFamiliarView();
  }, [closeFamiliarView, workspaceStore]);

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
    [workspaceNavigation.cancel, closeFamiliarView, setActiveTabIdState],
  );

  const inbox = useInboxFlows({
    store: workspaceStore,
    sessionsRef,
    setSessions,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    persist: (session) => sessionPersistence.persist(session),
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
  });
  const { btw, linkedPanels, addToChatDeps, linkedUpdatesRef, linkedUpdateCards, inboxActions } = inbox;
  useBtwAbortClosed(btw, sessions);

  useWorkspaceTeardown(btw);

  useAppViewWarmup(workspaceStore, notesEnabled);

  const { ref: projectReturnRef, read: readProjectReturnMemory } = useProjectReturnMemory({
    initial: resumed?.projectReturnMemory,
    tabs,
    sessions,
    activeTabId,
    tabsRef,
    sessionsRef,
    activeTabIdRef,
  });

  const tabVisits = useStableFlow(() =>
    createTabVisits(workspaceStore, activeTabId),
  );
  const storage = useSessionStorage({
    store: workspaceStore,
    sessionsRef,
    switchingWorktrees,
    sidebarCwd: () => sidebarCwdRef.current,
  });
  const { sessionPersistence } = storage;

  useProjectLocations(recents);

  useImportedSessionMarks(sessionPersistence, windowTransfer, resumed);

  const harness = useHarnessTurnFlows({
    sessionsRef,
    sessionState,
    setSessions,
    tabsRef,
    activeTabIdRef,
    foregroundSurfaceRef,
    turnGen,
    decideFamiliarApproval: (familiarId, blockId, decided) =>
      familiarChat.decide(familiarId, blockId, decided),
  });
  const { harnessEvents, turnActions } = harness;
  useHarnessIdlePark(harnessEvents);
  const flushHarnessEvents = harnessEvents.flush;
  const flushForegroundHarnessEvents = harnessEvents.flushForeground;

  useWindowUnload(resumed, readProjectReturnMemory, harnessEvents, {
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    projectTerminalsRef,
    lastDockSideRef,
  });

  useFamiliarThreadMigration(familiarsSnap, sessionsRef);

  useHarnessBootRefresh(sessionsRef, setSessions);

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

  useLinkedPanelPrune(workspaceStore, tabs);

  const sessionDefaults = active ?? sessions[0];
  const sessionDefaultsRef = useLatestRef(sessionDefaults);
  const activeTabRef = useLatestRef(activeTab);

  useWarmActiveSkills(active);

  const activeFile = activeTab ? focusedFileTab(activeTab) : undefined;
  const { sidebarCwd, gitCwd, terminalCwd, filesCwd, gitRootCwd, appViewScope } = workspaceCwds({
    activeFile,
    active,
    projectCwd,
    insetLayout,
  });
  const sidebarCwdRef = useRef(sidebarCwd);
  sidebarCwdRef.current = sidebarCwd;
  const terminalCwdRef = useRef(terminalCwd);
  terminalCwdRef.current = terminalCwd;
  const gitCwdRef = useRef(gitRootCwd);
  gitCwdRef.current = gitRootCwd;
  const sidebar = useSidebarTab(
    sidebarCwd,
    sidebarCwdRef,
    insetLayoutRef,
    showRightPanel,
  );
  const { sidebarTab, setSidebarTab } = sidebar;
  const newChatDefaultsRef = useRef({ active, sessionDefaults });
  newChatDefaultsRef.current = { active, sessionDefaults };
  useAddToChat(addToChatDeps, sessionDefaults?.cwd, sessionDefaults?.runtimeMode);
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

  const liveAgents = useLiveAgentsView({
    liveAgentsEnabled,
    promptableSessions,
    unseenFinishedIds,
    familiarsSnap,
    dismissedLiveAgentIds,
  });

  const hiddenApprovalToasts = useApprovalToastsView({
    promptableSessions,
    activeTabId,
    tabs,
    composerFocused,
    familiarViewId,
  });
  // The footer's slot for the resource pressure chip. Monitoring continues
  // while the footer is hidden.
  const [pressureChipHost, setPressureChipHost] =
    useState<HTMLSpanElement | null>(null);

  useDockBadge(sessions);

  useWindowFocus({
    flushForegroundHarnessEvents,
    sessionsRef,
    projectTerminalFocusedRef,
    searchViewOpenRef,
    inboxViewOpenRef,
    notesViewOpenRef,
    automationsViewOpenRef,
    settingsOpenRef,
    setComposerFocused,
    setComposerFocusToken,
  });

  useVisibilityFlush(flushHarnessEvents);

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

  useWindowClose(readProjectReturnMemory, flushHarnessEvents, keepWorkspaceTab, {
    sessionsRef,
    tabsRef,
    activeTabIdRef,
    projectCwdRef,
    projectTerminalsRef,
    lastDockSideRef,
  });

  const refreshHistory = useProjectHistory(workspaceStore, sidebarCwd, sidebarCwdRef);

  useInboxLinkedSessions(workspaceStore, inboxViewOpen);

  useProjectFilePrefetch(gitCwd);

  const persistSession = sessionPersistence.persist;

  useSessionAutosave(sessionPersistence, sessionState, tabsRef);

  useInFlightSnapshot(sessions, tabs);

  useWorkspaceSnapshotAutosave({
    tabs,
    sessions,
    activeTabId,
    projectCwd,
    projectTerminals,
    lastDockSide,
    windowTransfer,
    keepWorkspaceTab,
    worktreePath: projectWorktree?.path,
    navigationRevision: workspaceNavigation.revision,
    projectReturnRef,
  });

  useDefaultProject(workspaceStore, setSessions);

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
    openingSessionIds: storage.openingSessionIds,
    loadedSessionCache: storage.loadedSessionCache,
    skipForgetSessionIds,
    persistSession,
    setSessions,
  });

  const flows = useWorkspaceFlows({
    windowTransfer, core, storage, harness, inbox, familiarView, navigation: workspaceNavigation, selectTab: setActiveTabId,
    leaveCoveringFamiliar, sidebar, sidebarCwdRef, gitCwdRef, terminalCwdRef, sessionDefaultsRef, activeTabRef, activeSessionIdRef,
    activeChatId: () => newChatDefaultsRef.current.active?.id,
    tabVisits, refreshHistory, readProjectReturnMemory, noteReply: familiarReplies.noteReply, unseenFinishedIds,
    setDismissedLiveAgentIds, sessionDefaults,
  });
  const { flowCore, tabFlows, openerFlows, surfaceFlows, historyFlows, projectFlows, submissionFlows, turnQueueFlows } = flows;
  const { orchestrationFlows, deckProjectTabs, sessionReminders, taskBoard, isMainWindow, railBadges, orchestrationWorkers } = flows;
  const { tabLayout, terminals, newSessions } = tabFlows;
  const { sessionOpeners } = openerFlows;
  const { surfaces } = surfaceFlows;
  const { worktreeActions } = historyFlows;
  const { submission, familiarChat, automationRuns } = submissionFlows;
  const onOpenFamiliar = familiarView.open;

  const titleTabsView = useTitleTabsView({
    deckProjectTabs,
    sessions,
    dirtyFiles,
    unseenFinishedIds,
    insetLayout,
    openAppViews,
    notesEnabled,
    shownFamiliarTabs,
    sidebarCwd,
    titleTabOrder,
    settingsOpen,
    familiarViewId,
    familiarsSnap,
    activeAppView,
    activeTabId,
    tabProjectsRef,
  });
  const { titleTabs } = titleTabsView;

  const { projectHistory, sidebarHistory } = useSidebarHistoryView({
    history,
    promptableSessions,
    sidebarCwd,
    projectBranches,
    orchestrationRuns,
  });
  const {
    unseen: inboxUnseen,
    linkedSessionUpdateIds,
    linkedSessionUpdates,
  } = useInboxActivity(recents, sidebarCwd, sidebarHistory, {
    onAppeared: automationRuns.inboxAppeared,
    scopeProject: appViewScope,
  });
  linkedUpdatesRef.current = linkedSessionUpdates;
  const { inboxRelatedSessions, repairSessions } = useInboxView(storedLinkedSessions, history, sessions);
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



  displayedTabNavigation.current = {
    tabs: insetLayout ? titleTabs : [],
    activeId: titleTabsView.displayedActiveId,
    select: displayedTabs.selectTitleTab,
  };
  visibleTabsRef.current = titleTabsView.visibleTabs;

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
    openFile: projectFlows.fileActions.open,
    resume: turnQueueFlows.usageLimits.resume,
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
    <OrchestrationActions.Provider value={orchestrationFlows.orchestrationActions}>
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
              activeTab={activeTab}
              covered={chrome.surfaceOpen || familiarCovers}
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
                onLaunch: (automation, run) => automationRuns.launch(automation, run, true),
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
              <WorkspacePickerDialogs store={workspaceStore} cwd={filesCwd} />
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
