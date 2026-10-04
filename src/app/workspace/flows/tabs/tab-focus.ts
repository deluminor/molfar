import type { Session } from "@/domain/session/session";
import { isBlankSession } from "@/features/projects/model/project-return";
import {
  rememberProject,
  looksLikeProject,
  sameProjectPath,
} from "@/features/projects/model/recents";
import {
  leafIds,
  replaceLeafId,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import {
  findOpenSessionTab,
  focusedWorkspaceTabCwd,
} from "@/features/workspace/model/workspace-tab-groups";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import type { SessionPersistence } from "../session-history/session-persistence";
import type { WorkspaceStore } from "../../store/types";

export type TabSelectReason = "session" | "workspace";

export type TabFocusDeps = {
  store: WorkspaceStore;
  /** Tabs and sessions as Workspace last published them. */
  tabs(): WorkspaceTab[];
  sessions(): Session[];
  activeTabId(): string;
  projectCwd(): string;
  /** Makes a tab active; `workspace` keeps a running workspace switch going. */
  selectTab(tabId: string, reason: TabSelectReason): void;
  setComposerFocused(focused: boolean): void;
  cache: Map<string, Session>;
  persistence: SessionPersistence;
  forgetHarness(session: Session): void;
};

/** The pane to focus in `tab`: `paneId` when the tab holds it, else its current one. */
export function paneToFocus(
  tab: WorkspaceTab | undefined,
  paneId: string | undefined,
): string | undefined {
  if (!tab) return undefined;

  const holdsPane =
    !!paneId &&
    (leafIds(tab.layout).includes(paneId) ||
      tab.editorPanes.some((pane) => pane.id === paneId) ||
      (tab.terminalPanes ?? []).some((pane) => pane.id === paneId));
  return holdsPane ? paneId : tab.focusedId;
}

/**
 * Activates a tab, optionally focusing one of its panes, and switches the
 * workspace to the project the focused pane works in.
 */
export function activateTab(
  deps: TabFocusDeps,
  tabId: string,
  paneId?: string,
  reason: TabSelectReason = "session",
): void {
  const tab = deps.tabs().find((entry) => entry.id === tabId);
  const focusedId = paneToFocus(tab, paneId);

  deps.selectTab(tabId, reason);
  if (tab && focusedId && focusedId !== tab.focusedId) {
    deps.store
      .getState()
      .setTabs((previous) =>
        previous.map((entry) =>
          entry.id === tabId
            ? { ...entry, focusedId, diffFocused: false }
            : entry,
        ),
      );
  }

  if (tab) {
    const focusedTab = focusedId ? { ...tab, focusedId } : tab;
    switchToProjectOf(deps, focusedTab);
  }
  deps.setComposerFocused(
    !!focusedId && deps.sessions().some((session) => session.id === focusedId),
  );
}

function switchToProjectOf(deps: TabFocusDeps, tab: WorkspaceTab) {
  const cwd = focusedWorkspaceTabCwd(tab, deps.sessions());
  if (!cwd || !looksLikeProject(cwd)) return;

  const normalized = normalizeProjectPath(cwd);
  if (sameProjectPath(normalized, deps.projectCwd())) return;

  const { setProjectCwd, setRecents } = deps.store.getState();
  setProjectCwd(normalized);
  setRecents(rememberProject(normalized));
}

/** Focuses the tab where a session is already open; false when it is not open. */
export function focusOpenSession(
  deps: TabFocusDeps,
  sessionId: string,
): boolean {
  const tab = findOpenSessionTab(deps.tabs(), deps.sessions(), sessionId);
  if (!tab) return false;

  deps.cache.delete(sessionId);
  deps.selectTab(tab.id, "session");
  deps.store
    .getState()
    .setTabs((previous) =>
      previous.map((entry) =>
        entry.id === tab.id ? { ...entry, focusedId: sessionId } : entry,
      ),
    );
  deps.setComposerFocused(true);

  return true;
}

/**
 * Shows a session in place of a blank conversation pane in the active tab.
 * False when the tab has no blank pane to give up.
 */
export function replaceBlankPaneWithSession(
  deps: TabFocusDeps,
  session: Session,
): boolean {
  const tabs = deps.tabs();
  const tab = tabs.find((entry) => entry.id === deps.activeTabId()) ?? tabs[0];
  if (!tab) return false;

  const paneId = blankPaneOf(tab, deps.sessions());
  if (!paneId || paneId === session.id) return false;

  deps.persistence.forgetSaved(paneId);
  const blank = deps.sessions().find((entry) => entry.id === paneId);
  if (blank) deps.forgetHarness(blank);

  const { setSessions, setTabs } = deps.store.getState();
  setSessions((previous) => {
    const next = previous.filter((entry) => entry.id !== paneId);
    return next.some((entry) => entry.id === session.id)
      ? next
      : [...next, session];
  });
  setTabs((previous) =>
    previous.map((entry) =>
      entry.id === tab.id
        ? {
            ...entry,
            layout: replaceLeafId(entry.layout, paneId, session.id),
            focusedId: session.id,
          }
        : entry,
    ),
  );
  deps.selectTab(tab.id, "session");
  deps.setComposerFocused(true);

  return true;
}

/** The tab's focused pane if it is a blank conversation, else its first blank pane. */
function blankPaneOf(
  tab: WorkspaceTab,
  sessions: readonly Session[],
): string | undefined {
  const find = (id: string) => sessions.find((entry) => entry.id === id);
  if (isBlankSession(find(tab.focusedId))) return tab.focusedId;

  return leafIds(tab.layout).find((id) => isBlankSession(find(id)));
}
