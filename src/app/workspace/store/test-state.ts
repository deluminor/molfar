import type { WorkspaceInitialState } from "./types";

/** An empty workspace for store tests; override the fields a test cares about. */
export function testWorkspaceState(
  overrides: Partial<WorkspaceInitialState> = {},
): WorkspaceInitialState {
  return {
    projectCwd: "~",
    recents: [],
    sessions: [],
    tabs: [],
    activeTabId: "",
    tabVisitNav: { canBack: false, canForward: false },
    projectTerminals: [],
    lastDockSide: null,
    projectTerminalFocused: false,
    history: [],
    storedLinkedSessions: [],
    loadedProjects: new Set(),
    historyErrorCwd: null,
    filesSearchOpen: false,
    editorNavigation: null,
    filePickerOpen: false,
    filePickerInitialQuery: "",
    filePickerResetToken: 0,
    dirtyFiles: new Set(),
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
    settingsSection: "general",
    settingsAnchor: null,
    notificationProjectPath: null,
    notificationSettingsRequest: 0,
    ...overrides,
  };
}
