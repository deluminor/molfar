import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useStore } from "zustand";
import {
  subscribeFamiliars,
  familiarsSnapshot,
} from "@/features/familiars/model/familiar";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { findProjectTerminal } from "@/features/projects/model/project-terminal";
import {
  INSET_LAYOUT_DEFAULT,
  loadInsetLayout,
  subscribeInsetLayout,
} from "@/features/settings/model/appearance";
import { useNotesEnabled } from "@/features/settings/hooks/use-notes-enabled";
import {
  loadFamiliarsEnabled,
  loadLiveAgentsEnabled,
  subscribeFamiliarsEnabled,
  subscribeLiveAgentsEnabled,
} from "@/features/settings/model/settings";
import { createEditedResendCoordinator } from "@/features/sessions/model/edit-last-turn";
import { TranscriptPool } from "@/features/sessions/ui/TranscriptPool";
import { useWorktreeFocus } from "@/features/source-control/model/worktree-focus";
import { shownAppView } from "@/features/workspace/model/app-view-tabs";
import type { synchronizeProjectLocation } from "@/features/projects/model/project-location";
import { useLocalSurfaceState } from "../../../model/local-surfaces/use-local-surface-state";
import { commitTabSwitch } from "../../../model/navigation-performance";
import type { SettingsReturnView } from "../../../model/settings-return/types";
import { foregroundSurface } from "../../flows/harness-events/foreground-surface";
import { openOverviewDocument } from "../../flows/familiars/familiar-overview";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { shownFamiliarSession } from "../../store/familiars-slice";
import { initialWorkspaceState } from "../../store/initial-workspace";
import type {
  DisplayedTabNavigation,
  VisibleTabs,
} from "../../title-tabs/displayed-tabs-deps";
import { useInsetLayoutShell } from "../../ui/layout/use-inset-layout-shell";
import { useFamiliarOverviewSync } from "../familiars/use-familiar-overview-sync";
import { useFamiliarTabMigration } from "../familiars/use-familiar-tab-migration";
import { useRemoteHistoryRerender } from "../project-data/use-project-data-effects";
import { useLatestRef } from "../use-latest-ref";
import { useRightPanel } from "../use-right-panel";
import { useStableFlow } from "../use-stable-flow";
import { useTitleTabState } from "../use-title-tab-state";
import { useWorkspaceActions } from "../use-workspace-actions";
import { useWorkspaceField } from "../use-workspace-field";
import { useWorkspaceSessions } from "../use-workspace-sessions";
import type { WorkspaceProps } from "./types";
import { useWorkspacePins } from "./use-workspace-pins";

/**
 * The workspace store, its field and external-store reads, the local state and the refs every
 * flow reads. The subscriptions run in the order the Workspace always declared them.
 */
export function useWorkspaceCore({ windowTransfer = null, resumed = null, installedUpdate = null, history: bootHistory = [], historyCwd: bootHistoryCwd = null }: WorkspaceProps) {
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
    setTabs,
    setActiveTabId: setActiveTabIdState,
    setFilePickerOpen,
    setSearchViewOpen,
    setInboxViewOpen,
    setNotesViewOpen,
    setInspectedWorkerId,
    setSettingsOpen,
  } = useWorkspaceActions(workspaceStore);
  const projectCwd = useWorkspaceField(workspaceStore, "projectCwd");
  const recents = useWorkspaceField(workspaceStore, "recents");
  const { sessions, setSessions, sessionsRef, sessionState } = useWorkspaceSessions(workspaceStore);
  const switchingWorktrees = useRef(new Map<string, string>());
  const removingWorktreePaths = useRef(new Set<string>());
  const deleteConfirmationPending = useRef(false);
  const tabs = useWorkspaceField(workspaceStore, "tabs");
  const projectTerminals = useWorkspaceField(workspaceStore, "projectTerminals");
  const lastDockSide = useWorkspaceField(workspaceStore, "lastDockSide");
  const lastDockSideRef = useLatestRef(lastDockSide);
  const projectTerminalFocused = useWorkspaceField(workspaceStore, "projectTerminalFocused");
  const activeTabId = useWorkspaceField(workspaceStore, "activeTabId");
  const familiarViewId = useWorkspaceField(workspaceStore, "familiarViewId");
  const onOpenMonoArtifact = useCallback(
    (_sessionId: string, id: string) => openOverviewDocument(workspaceStore, id),
    [],
  );
  useFamiliarOverviewSync(workspaceStore, sessionsRef, setSessions);
  const familiarShownSessionFocused = useWorkspaceField(workspaceStore, "familiarShownSessionFocused");
  const shownFamiliarSessionId = useStore(workspaceStore, shownFamiliarSession);
  const [composerFocused, setComposerFocused] = useState(() => {
    if (windowTransfer) return true;
    if (!resumed) return false;
    const tab = resumed.tabs.find((entry) => entry.id === resumed.activeTabId) ?? resumed.tabs[0];
    return !!tab && resumed.sessions.some((session) => session.id === tab.focusedId);
  });
  const [composerFocusToken, setComposerFocusToken] = useState(0);
  /** Tab id -> project name, kept in sync with the rendered title tabs. */
  const tabProjectsRef = useRef(new Map<string, string>());
  const displayedTabNavigation = useRef<DisplayedTabNavigation>({ tabs: [], activeId: "" });
  const visibleTabsRef = useRef<VisibleTabs>({ insetLayout: false, activeTabId: "", titleTabs: [] });
  const projectOfTab = useCallback((id: string) => tabProjectsRef.current.get(id), []);
  const currentProjectDock = findProjectTerminal(projectTerminals, projectCwd);
  const searchViewOpen = useWorkspaceField(workspaceStore, "searchViewOpen");
  const inboxViewOpen = useWorkspaceField(workspaceStore, "inboxViewOpen");
  const inboxAskPortal = useWorkspaceField(workspaceStore, "inboxAskPortal");
  const notesViewOpen = useWorkspaceField(workspaceStore, "notesViewOpen");
  const localSurfaces = useLocalSurfaceState();
  const inspectedWorkerId = useWorkspaceField(workspaceStore, "inspectedWorkerId");
  const workerDetailRequest = useWorkspaceField(workspaceStore, "workerDetailRequest");
  const activeAppView = shownAppView({
    search: searchViewOpen,
    inbox: inboxViewOpen,
    notes: notesViewOpen,
    automations: localSurfaces.automationsSurfaceOpen,
  });
  const orchestrationRuns = useSyncExternalStore(orchestrator.subscribe, orchestrator.snapshot, orchestrator.snapshot);
  const notesEnabled = useNotesEnabled();
  const liveAgentsEnabled = useSyncExternalStore(subscribeLiveAgentsEnabled, loadLiveAgentsEnabled, () => true);
  const settingsOpen = useWorkspaceField(workspaceStore, "settingsOpen");
  const insetLayout = useSyncExternalStore(subscribeInsetLayout, loadInsetLayout, () => INSET_LAYOUT_DEFAULT);
  // Where Settings puts its breadcrumb and actions in the inset title bar.
  const [settingsHeaderHost, setSettingsHeaderHost] = useState<HTMLDivElement | null>(null);
  const insetLayoutRef = useLatestRef(insetLayout);
  const rightPanel = useRightPanel();
  const setInsetRailHost = useInsetLayoutShell(insetLayout);
  const settingsReturnViewRef = useRef<SettingsReturnView>({
    search: false,
    inbox: false,
    notes: false,
    automations: false,
    localSurface: null,
  });
  const familiarsEnabled = useSyncExternalStore(subscribeFamiliarsEnabled, loadFamiliarsEnabled, () => true);
  const familiarsSnap = useSyncExternalStore(subscribeFamiliars, familiarsSnapshot);
  const titleTabState = useTitleTabState(tabs, insetLayout, familiarsEnabled, familiarsSnap);
  const editorNavigationToken = useRef(0);
  const dirtyFiles = useWorkspaceField(workspaceStore, "dirtyFiles");
  const history = useWorkspaceField(workspaceStore, "history");
  useRemoteHistoryRerender();
  const storedLinkedSessions = useWorkspaceField(workspaceStore, "storedLinkedSessions");
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const projectTerminalsRef = useLatestRef(projectTerminals);
  const projectTerminalFocusedRef = useLatestRef(projectTerminalFocused);
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
  const pins = useWorkspacePins(tabs, sessions, sessionsRef);
  const projectCwdRef = useRef(projectCwd);
  projectCwdRef.current = projectCwd;
  const foregroundSurfaceRef = useLatestRef(
    foregroundSurface({
      searchViewOpen,
      inboxViewOpen,
      notesViewOpen,
      automationsViewOpen: localSurfaces.automationsViewOpen,
      settingsOpen,
      familiarViewId,
      inboxAskSessionId: inboxAskPortal?.sessionId,
      shownFamiliarSessionId,
    }),
  );
  const [transcriptPool] = useState(() => new TranscriptPool());

  return {
    workspaceStore, setTabs, setActiveTabIdState, setFilePickerOpen, setSearchViewOpen, setInboxViewOpen, setNotesViewOpen,
    setInspectedWorkerId, setSettingsOpen, projectCwd, recents, sessions, setSessions, sessionsRef, sessionState,
    switchingWorktrees, removingWorktreePaths, deleteConfirmationPending, tabs, projectTerminals, lastDockSide, lastDockSideRef,
    activeTabId, familiarViewId, onOpenMonoArtifact, familiarShownSessionFocused, shownFamiliarSessionId,
    composerFocused, setComposerFocused, composerFocusToken, setComposerFocusToken, tabProjectsRef, displayedTabNavigation,
    visibleTabsRef, projectOfTab, currentProjectDock, searchViewOpen, inboxViewOpen, inboxAskPortal, notesViewOpen, localSurfaces,
    ...localSurfaces, inspectedWorkerId, workerDetailRequest, activeAppView, orchestrationRuns, notesEnabled, liveAgentsEnabled,
    settingsOpen, insetLayout, settingsHeaderHost, setSettingsHeaderHost, insetLayoutRef, rightPanel, setInsetRailHost,
    settingsReturnViewRef, familiarsEnabled, familiarsSnap, ...titleTabState, editorNavigationToken, dirtyFiles, history,
    storedLinkedSessions, tabsRef, projectTerminalsRef, projectTerminalFocusedRef, activeTabIdRef, projectWorktree, ...pins,
    projectCwdRef, foregroundSurfaceRef, transcriptPool,
    searchViewOpenRef: useLatestRef(searchViewOpen),
    inboxViewOpenRef: useLatestRef(inboxViewOpen),
    notesViewOpenRef: useLatestRef(notesViewOpen),
    automationsViewOpenRef: useLatestRef(localSurfaces.automationsViewOpen),
    settingsOpenRef: useLatestRef(settingsOpen),
    sessionNavigationIdsRef: useRef<readonly string[]>([]),
    turnGen: useRef(new Map<string, number>()),
    editedResends: useRef(createEditedResendCoordinator()).current,
    skipForgetSessionIds: useRef(new Set<string>()),
    projectLocationSyncs: useRef(new Map<string, ReturnType<typeof synchronizeProjectLocation>>()),
  };
}

export type WorkspaceCore = ReturnType<typeof useWorkspaceCore>;
