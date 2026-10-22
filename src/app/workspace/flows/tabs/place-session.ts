import type { Session } from "@/domain/session/session";
import { isBlankSession } from "@/features/projects/model/project-return";
import { forgetHarnessSession } from "@/integrations/harness";
import { newDefaultSession } from "@/features/sessions/model/session";
import { leafIds, type PaneEdge, type WorkspaceTab } from "@/features/workspace/model/layout";
import { applyPlaceSessionOnPane, applyPlaceTabOnPane } from "@/features/workspace/model/workspace-tab-groups";
import type { WorkspaceStore } from "../../store/types";
import type { SessionPersistence } from "../session-history/session-persistence";

export type PlaceSessionDeps = {
  store: WorkspaceStore;
  sessionsRef: { current: Session[] };
  tabsRef: { current: WorkspaceTab[] };
  persistence: Pick<SessionPersistence, "forgetSaved">;
  scope: "project";
  projectCwd(): string;
  ensureOpenSession(sessionId: string): Promise<Session | null | undefined>;
  setSessions(sessions: Session[]): void;
  selectTab(tabId: string): void;
  setComposerFocused(focused: boolean): void;
};

/** Drops a session onto a pane edge, replacing the target when it is blank. */
export async function placeSessionOnPane(
  deps: PlaceSessionDeps,
  sessionId: string,
  targetId: string,
  edge: PaneEdge,
): Promise<void> {
  if (sessionId === targetId) return;
  const targetTab = deps.tabsRef.current.find((tab) => leafIds(tab.layout).includes(targetId));
  if (!targetTab) return;

  if (!leafIds(targetTab.layout).includes(sessionId) && !(await deps.ensureOpenSession(sessionId))) return;

  // The tab may have changed while the session loaded.
  const tab = deps.tabsRef.current.find((entry) => entry.id === targetTab.id);
  if (!tab || !leafIds(tab.layout).includes(targetId)) return;

  const target = deps.sessionsRef.current.find((entry) => entry.id === targetId);
  const replaceTarget = !leafIds(tab.layout).includes(sessionId) && isBlankSession(target);
  if (replaceTarget) {
    deps.persistence.forgetSaved(targetId);
    if (target) void forgetHarnessSession(target.harness, targetId);
  }

  const result = applyPlaceSessionOnPane({
    tabs: deps.tabsRef.current,
    sessions: deps.sessionsRef.current,
    sessionId,
    targetId,
    edge,
    replaceTarget,
    scope: deps.scope,
    createReplacement: (seed) => newDefaultSession(seed?.cwd ?? deps.projectCwd(), seed?.runtimeMode),
  });
  if (!result) return;

  const { setTabs, setProjectTerminalFocused } = deps.store.getState();
  deps.sessionsRef.current = result.sessions;
  deps.tabsRef.current = result.tabs;
  deps.setSessions(result.sessions);
  setTabs(result.tabs);
  deps.selectTab(result.activeTabId);
  setProjectTerminalFocused(false);
  deps.setComposerFocused(true);
}

/** Drops a whole tab onto a pane edge of another tab, replacing the target when it is blank. */
export function placeTabOnPane(deps: PlaceSessionDeps, sourceTabId: string, targetId: string, edge: PaneEdge): void {
  const targetTab = deps.tabsRef.current.find((tab) => leafIds(tab.layout).includes(targetId));
  if (!targetTab || targetTab.id === sourceTabId) return;

  const blankTarget = deps.sessionsRef.current.find(
    (session) => session.id === targetId && isBlankSession(session),
  );
  const result = applyPlaceTabOnPane({
    tabs: deps.tabsRef.current,
    sessions: deps.sessionsRef.current,
    sourceTabId,
    targetId,
    edge,
    replaceTarget: blankTarget != null,
  });
  if (!result) return;

  if (blankTarget) {
    deps.persistence.forgetSaved(blankTarget.id);
    void forgetHarnessSession(blankTarget.harness, blankTarget.id);
  }
  const { setTabs, setProjectTerminalFocused } = deps.store.getState();
  deps.sessionsRef.current = result.sessions;
  deps.tabsRef.current = result.tabs;
  deps.setSessions(result.sessions);
  setTabs(result.tabs);
  deps.selectTab(result.activeTabId);
  setProjectTerminalFocused(false);
  deps.setComposerFocused(result.sessions.some((session) => session.id === result.focusedId));
}
