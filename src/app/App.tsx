import { Suspense, useCallback, useMemo, useRef, useState } from "react";
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
import { useProjectBranches } from "@/features/source-control/hooks/use-project-branches";
import { useStableFlow } from "./workspace/hooks/use-stable-flow";
import { useSessionStorage } from "./workspace/hooks/flows/use-session-storage";
import { useHarnessTurnFlows } from "./workspace/hooks/flows/use-harness-turn-flows";
import { useInboxFlows } from "./workspace/hooks/flows/use-inbox-flows";
import { useWorkspaceFlows } from "./workspace/hooks/workspace-flows/use-workspace-flows";
import { WorkspaceView } from "./workspace/ui/workspace-view/WorkspaceView";
import { useWorkspaceViewFlows } from "./workspace/hooks/workspace-view/use-workspace-view-flows";
import { useWorkspaceCore } from "./workspace/hooks/core/use-workspace-core";
import type { WorkspaceProps } from "./workspace/hooks/core/types";
import { useSidebarTab } from "./workspace/hooks/sidebar/use-sidebar-tab";
import { useLiveAgentsView } from "./workspace/hooks/sidebar/use-live-agents-view";
import { useApprovalToastsView } from "./workspace/hooks/notifications/use-approval-toasts-view";
import { createFamiliarView } from "./workspace/flows/familiars/familiar-view";
import { useAddToChat } from "./workspace/hooks/use-add-to-chat";
import { useLatestRef } from "./workspace/hooks/use-latest-ref";
import { createTabVisits } from "./workspace/flows/tabs/tab-visits";
import { registerBuiltinHarnesses } from "@/integrations/harness";
import { focusedFileTab, leafIds } from "@/features/workspace/model/layout";
import { useInputNotifications } from "@/features/notifications/hooks/use-input-notifications";
import { useDockBadge, useNotificationPermissionProbe } from "./workspace/hooks/notifications/use-notification-effects";
import { useUnseenFinishedSessions } from "@/features/sessions/hooks/use-unseen-finished-sessions";
import { useUnseenReplyCounts } from "@/features/sessions/hooks/use-unseen-reply-counts";
import { listFamiliars } from "@/features/familiars/model/familiar";
import { isBusySession } from "./model/session-id-sets";
import { useProviderSignInPrompt } from "./workspace/hooks/use-provider-sign-in-prompt";
import { useSessionIdSet } from "./workspace/hooks/use-session-id-set";
import { useAppViewWarmup } from "./workspace/ui/app-views/use-app-view-warmup";
import {
  useInboxLinkedSessions,
  useLinkedPanelPrune,
} from "./workspace/hooks/inbox/use-inbox-effects";
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

export default function App(props: WorkspaceProps) {
  return (
    <Suspense fallback={null}>
      <Workspace {...props} />
    </Suspense>
  );
}

function Workspace(props: WorkspaceProps) {
  const { windowTransfer = null, resumed = null } = props;
  const core = useWorkspaceCore(props);
  const {
    workspaceStore, setActiveTabIdState, projectCwd, recents, sessions, setSessions, sessionsRef, sessionState,
    switchingWorktrees, tabs, projectTerminals, lastDockSide, lastDockSideRef, activeTabId, familiarViewId,
    familiarShownSessionFocused, shownFamiliarSessionId, composerFocused, setComposerFocused, setComposerFocusToken,
    searchViewOpen, inboxViewOpen, inboxAskPortal, notesViewOpen, automationsViewOpen, setAutomationsViewOpen,
    orchestrationRuns, notesEnabled, liveAgentsEnabled, settingsOpen, insetLayout, insetLayoutRef, rightPanel,
    familiarsSnap, setOpenFamiliarTabs, tabsRef, projectTerminalsRef, projectTerminalFocusedRef, activeTabIdRef,
    projectWorktree, workspacePins, tabWorkspace, keepWorkspaceTab, projectCwdRef, foregroundSurfaceRef,
    searchViewOpenRef, inboxViewOpenRef, notesViewOpenRef, automationsViewOpenRef, settingsOpenRef, turnGen,
    skipForgetSessionIds,
  } = core;
  const { show: showRightPanel } = rightPanel;
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
  const { btw, addToChatDeps } = inbox;
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
  const cwds = workspaceCwds({ activeFile, active, projectCwd, insetLayout });
  const { sidebarCwd, gitCwd, terminalCwd, gitRootCwd } = cwds;
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
  const { setSidebarTab } = sidebar;
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
  const { tabFlows, openerFlows, historyFlows, submissionFlows } = flows;
  const { tabLayout, newSessions } = tabFlows;
  const { sessionOpeners } = openerFlows;
  const { worktreeActions } = historyFlows;
  const { submission, familiarChat } = submissionFlows;

  const { titleTabFlows, view } = useWorkspaceViewFlows({
    core, flows, inbox, turnActions, familiarView, sidebar, cwds, promptableSessions, projectBranches, unseenFinishedIds,
    familiarViewSession, familiarCovers,
  });

  return (
    <WorkspaceView
      core={core}
      flows={flows}
      titleTabFlows={titleTabFlows}
      view={{
        ...view, active, activeTab, activeSessionId, usageSource, familiarViewSession, familiarCovers, workspaceNavigation,
        cwds, sidebar, familiarReplyCounts: familiarReplies.counts, busySessionIds, unseenFinishedIds, liveAgents,
        hiddenApprovalToasts, pressureChipHost, setPressureChipHost,
      }}
    />
  );
}
