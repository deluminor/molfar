import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import {
  flushSessionWrites,
  shouldPersistSession,
  upsertSession,
} from "@/features/sessions/data/session-store";
import { flushSessionCheckpoint, notifyReviewChanged } from "@/features/sessions/model/checkpoint";
import { sessionChildHarnesses } from "@/features/sessions/model/handoff";
import { rememberProject } from "@/features/projects/model/recents";
import {
  assertWorktreeFilesClosed,
  checkWorktreeRemoval,
  detachSessionWorktree,
  listWorktrees,
  removeWorktree,
  worktreeSessionIds,
} from "@/features/source-control/model/worktrees";
import { filesInWorkspaceTabs } from "@/features/workspace/model/tab-files";
import { bindHarnessSession, forgetHarnessSession, stopStreaming } from "@/integrations/harness";
import { isEqualOrInside, pathKey } from "@/shared/lib/paths";
import { bindResumedSessions } from "../../../model/app-lifecycle";
import { commitSessions, type WorktreeDeps } from "./worktree-deps";

/** Throws while a file or terminal is still open in the worktree. */
export function checkOpenWorktreeFiles(deps: WorktreeDeps, path: string): void {
  assertWorktreeFilesClosed(path, [
    ...filesInWorkspaceTabs(deps.tabsRef.current),
    ...deps.projectTerminals().flatMap((dock) => dock.pane.files),
  ]);
}

export async function checkRemoval(deps: WorktreeDeps, cwd: string, path: string, force: boolean): Promise<void> {
  checkOpenWorktreeFiles(deps, path);
  await checkWorktreeRemoval(cwd, path, force);
  // Re-read UI state after the native check, before deleting sessions.
  checkOpenWorktreeFiles(deps, path);
}

/** The sessions using the worktree, once nothing else is changing them. */
async function sessionsToRemove(
  deps: WorktreeDeps,
  cwd: string,
  path: string,
  force: boolean,
  keepSessions: boolean,
): Promise<string[]> {
  if ([...deps.switchingWorktrees.current.values()].some((target) => isEqualOrInside(target, path))) {
    throw new Error("A session is selecting this worktree. Try deleting it again once selection finishes.");
  }
  await checkRemoval(deps, cwd, path, force);
  const listed = await listWorktrees(cwd);
  const tree = listed.worktrees.find((entry) => pathKey(entry.path) === pathKey(path));
  if (!tree) throw new Error("This worktree is no longer available.");

  const ids = worktreeSessionIds(tree, deps.sessionsRef.current);
  if (!keepSessions && ids.length) throw new Error("Move or delete the sessions using this worktree first.");
  if (ids.some((id) => deps.removingSessionIds.current.has(id) || deps.switchingWorktrees.current.has(id))) {
    throw new Error("Wait for these sessions to finish changing before deleting the worktree.");
  }
  return ids;
}

/** Stops a kept session's agent and saves it paused, before its worktree goes. */
async function stopWorktreeSession(deps: WorktreeDeps, id: string, forgotten: Set<string>): Promise<void> {
  await deps.stopSessionForRemoval(id);
  const session = deps.sessionsRef.current.find((entry) => entry.id === id);
  if (!session) return;

  await flushSessionCheckpoint(id);
  forgotten.add(id);
  for (const harness of sessionChildHarnesses(session)) await forgetHarnessSession(harness, id);
  const latest = deps.sessionsRef.current.find((entry) => entry.id === id);
  if (!latest) return;

  const stopped = {
    ...stopStreaming(latest),
    busy: false,
    queueStatus: "paused" as const,
    pendingQuestion: undefined,
  };
  commitSessions(
    deps,
    deps.sessionsRef.current.map((entry) => (entry.id === id ? stopped : entry)),
  );
  if (shouldPersistSession(stopped)) await upsertSession(stopped);
}

/** Points every affected session, open or saved, back at its project. */
function detachRemoved(deps: WorktreeDeps, affected: Set<string>, projectCwd: string, path: string): void {
  const { setProjectCwd, setRecents, setHistory, setStoredLinkedSessions } = deps.store.getState();
  if (isEqualOrInside(deps.projectCwd(), path)) {
    setProjectCwd(projectCwd);
    setRecents(rememberProject(projectCwd));
  }
  for (const id of affected) {
    deps.invalidateLoadedSession(id);
    deps.persistence.dropPending(id);
    deps.persistence.forgetSaved(id);
  }
  commitSessions(
    deps,
    deps.sessionsRef.current.map((session) =>
      affected.has(session.id) ? detachSessionWorktree(session, projectCwd, path) : session,
    ),
  );
  const patchSummary = (entry: SessionSummary) =>
    affected.has(entry.id) ? detachSessionWorktree(entry, projectCwd, path) : entry;
  setHistory((current) => current.map(patchSummary));
  setStoredLinkedSessions((current) => current.map(patchSummary));
  for (const id of affected) notifyReviewChanged(id);
}

/**
 * Removal may fail after idle agent processes were stopped. Rebinds their
 * saved threads so the unchanged working copy can still resume.
 */
function rebindKept(deps: WorktreeDeps, forgotten: Set<string>): void {
  const kept: Session[] = deps.sessionsRef.current.filter(
    (session) => forgotten.has(session.id) && !session.worktreeRemoved,
  );
  bindResumedSessions(kept);
  for (const session of kept) {
    const pending = session.pendingSwitch;
    if (pending?.fromProviderSessionId) {
      bindHarnessSession(
        pending.from,
        session.id,
        pending.fromProviderSessionId,
        sessionWorkCwd(session),
        pending.fromProviderAccountId,
        session.blocks,
      );
    }
  }
}

/** Deletes a worktree; with `keepSessions`, its sessions move back to the project. */
export async function removeSessionWorktree(
  deps: WorktreeDeps,
  cwd: string,
  path: string,
  force: boolean,
  keepSessions = false,
): Promise<void> {
  if (deps.removingWorktreePaths.current.has(path)) throw new Error("This worktree is already being deleted.");
  deps.removingWorktreePaths.current.add(path);
  const lockedIds = new Set<string>();
  const forgottenIds = new Set<string>();
  try {
    const ids = await sessionsToRemove(deps, cwd, path, force, keepSessions);
    for (const id of ids) {
      deps.removingSessionIds.current.add(id);
      lockedIds.add(id);
      deps.persistence.dropPending(id);
      deps.invalidateLoadedSession(id);
    }
    for (const id of ids) await stopWorktreeSession(deps, id, forgottenIds);
    await flushSessionWrites();
    checkOpenWorktreeFiles(deps, path);

    const removed = await removeWorktree(cwd, path, force, keepSessions);
    detachRemoved(deps, new Set([...ids, ...removed.sessionIds]), removed.projectCwd, path);
  } catch (error) {
    rebindKept(deps, forgottenIds);
    throw error;
  } finally {
    deps.removingWorktreePaths.current.delete(path);
    for (const id of lockedIds) deps.removingSessionIds.current.delete(id);
  }
}
