import { lastProjectPath } from "@/features/projects/model/recents";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import type { ResumedWorkspace } from "@/features/sessions/model/in-flight";
import { newDefaultSession } from "@/features/sessions/model/session";
import {
  loadProjectRailOpen,
  loadSessionSidebarOpen,
} from "@/features/settings/model/appearance";
import {
  loadCollapsedProjectRailMode,
  loadSettingsSection,
} from "@/features/settings/model/settings";
import type { InstalledUpdate } from "@/features/updates/model/update-notice";
import { newTab } from "@/features/workspace/model/layout";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import type { WindowTransferPayload } from "../../model/window-transfer";
import { initialProjectsState } from "./initial-projects";
import type { WorkspaceInitialState } from "./types";

export type WorkspaceBoot = {
  /** Update installed since the last launch, to announce. */
  installedUpdate: InstalledUpdate | null;
  windowTransfer: WindowTransferPayload | null;
  resumed: ResumedWorkspace | null;
  /** Saved sessions of `historyCwd`, listed before the window opened. */
  history: SessionSummary[];
  historyCwd: string | null;
};

/**
 * What a window opens with: a transferred or resumed workspace, else one blank
 * session in one tab. Projects resolve first, since remembering a resumed
 * project changes which project the blank session starts in.
 */
export function initialWorkspaceState(
  boot: WorkspaceBoot,
): WorkspaceInitialState {
  const projects = initialProjectsState(boot);

  const session = newDefaultSession(lastProjectPath() ?? "~");
  const tab = newTab(session.id);
  const { windowTransfer, resumed, history, historyCwd, installedUpdate } =
    boot;

  return {
    ...projects,
    sessions: windowTransfer?.sessions ?? resumed?.sessions ?? [session],
    tabs: windowTransfer?.tabs ?? resumed?.tabs ?? [tab],
    activeTabId: windowTransfer?.activeTabId ?? resumed?.activeTabId ?? tab.id,
    tabVisitNav: { canBack: false, canForward: false },
    projectTerminals:
      windowTransfer?.projectTerminals ?? resumed?.projectTerminals ?? [],
    lastDockSide: resumed?.lastDockSide ?? null,
    projectTerminalFocused: false,
    history,
    storedLinkedSessions: history.filter((session) => session.linkedWorkItem),
    loadedProjects: historyCwd
      ? new Set([normalizeProjectPath(historyCwd)])
      : new Set(),
    historyErrorCwd: null,
    filesSearchOpen: false,
    editorNavigation: null,
    filePickerOpen: false,
    filePickerInitialQuery: "",
    filePickerResetToken: 0,
    dirtyFiles: new Set(windowTransfer?.dirtyFileIds ?? []),
    fileErrorCounts: new Map(),
    searchViewOpen: false,
    searchFocusToken: 0,
    searchViewFocusToken: 0,
    inboxViewOpen: false,
    linkedWorkItemPanels: new Map(),
    inboxAskPortal: null,
    notesViewOpen: false,
    inspectedWorkerId: null,
    workerDetailRequest: null,
    settingsOpen: false,
    settingsSection: loadSettingsSection(),
    settingsAnchor: null,
    notificationProjectPath: null,
    notificationSettingsRequest: 0,
    projectRailOpen: loadProjectRailOpen(),
    sessionSidebarOpen: loadSessionSidebarOpen(),
    collapsedProjectRailMode: loadCollapsedProjectRailMode(),
    updateNotice: installedUpdate,
    whatsNewVersion: null,
    providerSignInRequest: null,
    sessionDeleteDialog: undefined,
    remoteProjectDialogOpen: false,
  };
}
