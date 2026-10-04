import { lastProjectPath } from "@/features/projects/model/recents";
import type { ResumedWorkspace } from "@/features/sessions/model/in-flight";
import { newDefaultSession } from "@/features/sessions/model/session";
import { newTab } from "@/features/workspace/model/layout";
import type { WindowTransferPayload } from "../../model/window-transfer";
import { initialProjectsState } from "./initial-projects";
import type { WorkspaceInitialState } from "./types";

export type WorkspaceBoot = {
  windowTransfer: WindowTransferPayload | null;
  resumed: ResumedWorkspace | null;
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
  const { windowTransfer, resumed } = boot;

  return {
    ...projects,
    sessions: windowTransfer?.sessions ?? resumed?.sessions ?? [session],
    tabs: windowTransfer?.tabs ?? resumed?.tabs ?? [tab],
    activeTabId: windowTransfer?.activeTabId ?? resumed?.activeTabId ?? tab.id,
    tabVisitNav: { canBack: false, canForward: false },
  };
}
