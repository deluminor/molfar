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
    ...overrides,
  };
}
