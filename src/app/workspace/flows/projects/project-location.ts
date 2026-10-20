import { rebaseCiRepairs } from "@/features/inbox/model/ci-repair-tracking";
import { notifyDirsChanged } from "@/features/files/model/file-tree";
import { rebaseProjectData } from "@/features/projects/model/project-data";
import { replaceProjectPath, sameProjectPath } from "@/features/projects/model/recents";
import { rebaseProjectSessions } from "@/features/sessions/data/session-store";
import { pathKey } from "@/shared/lib/paths";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import type { ProjectDeps } from "./project-deps";

/** A project's folder moved on disk: everything that remembers its path follows it. */
export async function moveProjectLocation(deps: ProjectDeps, from: string, to: string): Promise<void> {
  await rebaseProjectSessions(from, to);
  rebaseCiRepairs(from, to);
  const moved = <T extends { cwd: string }>(entry: T): T =>
    sameProjectPath(entry.cwd, from) ? { ...entry, cwd: to } : entry;
  const state = deps.store.getState();

  const nextSessions = deps.sessionsRef.current.map(moved);
  deps.sessionsRef.current = nextSessions;
  deps.setSessions(nextSessions);
  for (const [id, session] of deps.loadedSessionCache.current) {
    if (sameProjectPath(session.cwd, from)) deps.loadedSessionCache.current.set(id, { ...session, cwd: to });
  }
  deps.persistence.mapPending(moved);
  state.setHistory((current) => current.map(moved));
  state.setStoredLinkedSessions((current) => current.map(moved));
  state.setLoadedProjects((current) => {
    const next = new Set(current);
    next.delete(normalizeProjectPath(from));
    next.add(normalizeProjectPath(to));
    return next;
  });

  if (sameProjectPath(deps.projectCwdRef.current, from)) {
    deps.projectCwdRef.current = to;
    state.setProjectCwd(to);
  }
  const nextDocks = deps.projectTerminalsRef.current.map((dock) =>
    sameProjectPath(dock.projectPath, from) ? { ...dock, projectPath: to } : dock,
  );
  deps.projectTerminalsRef.current = nextDocks;
  state.setProjectTerminals(nextDocks);
  rebaseProjectData(from, to);
  deps.setSidebarTabSelection((current) =>
    sameProjectPath(current.project, from) ? { ...current, project: pathKey(to) } : current,
  );
  state.setRecents(replaceProjectPath(from, to));
  deps.fileMoved(from, to);
  notifyDirsChanged();
}
