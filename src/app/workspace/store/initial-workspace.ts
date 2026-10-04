import { lastProjectPath } from "@/features/projects/model/recents";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import type { ResumedWorkspace } from "@/features/sessions/model/in-flight";
import { newDefaultSession } from "@/features/sessions/model/session";
import { newTab } from "@/features/workspace/model/layout";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import type { WindowTransferPayload } from "../../model/window-transfer";
import { initialProjectsState } from "./initial-projects";
import type { WorkspaceInitialState } from "./types";

export type WorkspaceBoot = {
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
  const { windowTransfer, resumed, history, historyCwd } = boot;

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
  };
}
