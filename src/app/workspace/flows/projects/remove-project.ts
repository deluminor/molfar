import type { Session } from "@/domain/session/session";
import { removeProjectData } from "@/features/projects/model/project-data";
import { forgetProjectLocation } from "@/features/projects/model/project-location";
import {
  archiveProject,
  forgetProject,
  looksLikeProject,
  sameProjectPath,
} from "@/features/projects/model/recents";
import { rememberLoadedSession } from "@/features/sessions/data/session-cache";
import { shouldPersistSession } from "@/features/sessions/data/session-store";
import { sessionChildHarnesses } from "@/features/sessions/model/handoff";
import { newDefaultSession } from "@/features/sessions/model/session";
import { loadProjectSidebarTab } from "@/features/settings/model/project-sidebar-tab";
import { newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { filterTabsForProject } from "@/features/workspace/model/workspace-tab-groups";
import { cancelHarnessTurn, forgetHarnessSession } from "@/integrations/harness";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import { selectProject } from "./open-projects";
import type { ProjectDeps } from "./project-deps";

/** Deleting a project: its sessions stop and every saved trace of them goes. */
function purgeSessions(deps: ProjectDeps, project: string, sessions: Session[]): void {
  const cachedOrLoading = new Set([...deps.loadedSessionCache.current.keys(), ...deps.loadingSessionIds()]);
  for (const sessionId of cachedOrLoading) deps.invalidateLoadedSession(sessionId);
  for (const session of sessions) {
    deps.persistence.dropPending(session.id);
    if (session.busy) {
      deps.turnGen.current.set(session.id, (deps.turnGen.current.get(session.id) ?? 0) + 1);
      for (const id of sessionChildHarnesses(session)) void cancelHarnessTurn(id, session.id);
    }
    for (const id of sessionChildHarnesses(session)) void forgetHarnessSession(id, session.id);
    deps.persistence.forgetSaved(session.id);
  }
  void removeProjectData(project);
}

/** Archiving a project: idle sessions are saved and let go; running ones keep running. */
function archiveSessions(deps: ProjectDeps, sessions: Session[]): void {
  for (const session of sessions) {
    if (session.busy) continue;
    if (shouldPersistSession(session)) rememberLoadedSession(deps.loadedSessionCache.current, session);
    deps.persistence.persist(session);
    deps.persistence.dropPending(session.id);
    for (const id of sessionChildHarnesses(session)) void forgetHarnessSession(id, session.id);
  }
}

/** Closes the project's tabs, leaving a blank one when nothing else is open. */
function closeProjectTabs(
  deps: ProjectDeps,
  projectTabs: WorkspaceTab[],
  projectSessionIds: Set<string>,
  purgeData: boolean,
): void {
  const { setTabs, setDirtyFiles, activeTabId } = deps.store.getState();
  const projectTabIds = new Set(projectTabs.map((tab) => tab.id));
  let nextTabs = deps.tabsRef.current.filter((tab) => !projectTabIds.has(tab.id));
  let nextSessions = deps.sessionsRef.current.filter(
    (session) => !projectSessionIds.has(session.id) || (!purgeData && session.busy),
  );
  let nextActiveTabId = deps.activeTabIdRef.current;
  if (nextTabs.length === 0) {
    const session = newDefaultSession("~", nextSessions[0]?.runtimeMode);
    const tab = newTab(session.id);
    nextSessions = [...nextSessions, session];
    nextTabs = [tab];
    nextActiveTabId = tab.id;
  } else if (projectTabIds.has(nextActiveTabId)) {
    nextActiveTabId = nextTabs[0]?.id ?? nextActiveTabId;
  }

  deps.sessionsRef.current = nextSessions;
  deps.tabsRef.current = nextTabs;
  deps.activeTabIdRef.current = nextActiveTabId;
  deps.setSessions(nextSessions);
  setTabs(nextTabs);
  if (nextActiveTabId !== activeTabId) deps.selectTab(nextActiveTabId);
  setDirtyFiles((prev) => {
    const updated = new Set(prev);
    for (const tab of projectTabs) {
      for (const file of [
        ...tab.editorPanes.flatMap((pane) => pane.files),
        ...(tab.terminalPanes ?? []).flatMap((pane) => pane.files),
      ]) {
        updated.delete(file.id);
      }
    }
    return updated;
  });
}

/** Archives a project, or with `purgeData` deletes it and its sessions' data. */
export function removeProject(deps: ProjectDeps, path: string, options: { purgeData: boolean }): void {
  const { setRecents, setProjectTerminals, setProjectCwd } = deps.store.getState();
  const normalized = normalizeProjectPath(path);
  const wasCurrent = sameProjectPath(deps.projectCwdRef.current, normalized);
  const remaining = options.purgeData ? forgetProject(normalized) : archiveProject(normalized);
  if (options.purgeData) {
    forgetProjectLocation(normalized);
    deps.setSidebarTabSelection((current) =>
      sameProjectPath(current.project, normalized)
        ? { project: "~", tab: loadProjectSidebarTab("~") }
        : current,
    );
  }
  setRecents(remaining);

  const projectTabs = filterTabsForProject(deps.tabsRef.current, deps.sessionsRef.current, normalized);
  const projectSessions = deps.sessionsRef.current.filter((session) => sameProjectPath(session.cwd, normalized));
  if (options.purgeData) purgeSessions(deps, normalized, projectSessions);
  else archiveSessions(deps, projectSessions);
  closeProjectTabs(deps, projectTabs, new Set(projectSessions.map((session) => session.id)), options.purgeData);
  setProjectTerminals((prev) => prev.filter((dock) => !sameProjectPath(dock.projectPath, normalized)));

  if (!wasCurrent) return;
  const next = remaining.find((item) => looksLikeProject(item.path));
  if (next) {
    selectProject(deps, next.path);
    setProjectCwd(next.path);
  } else {
    setProjectCwd("~");
    deps.focusComposer();
  }
}
