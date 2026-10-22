import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { isBlankSession } from "@/features/projects/model/project-return";
import { shouldPersistSession, upsertSession } from "@/features/sessions/data/session-store";
import {
  flushSessionCheckpoint,
  keepSessionChanges,
  notifyReviewChanged,
} from "@/features/sessions/model/checkpoint";
import { sessionChildHarnesses } from "@/features/sessions/model/handoff";
import {
  listWorktrees,
  sessionInWorktree,
  type Worktree,
} from "@/features/source-control/model/worktrees";
import { newTab } from "@/features/workspace/model/layout";
import { forgetHarnessSession } from "@/integrations/harness";
import { notifyGitChanged } from "@/platform/tauri/fs";
import { isEqualOrInside, pathKey } from "@/shared/lib/paths";
import { currentWorkspace } from "../../../model/current-workspace";
import { commitSessions, type WorktreeDeps } from "./worktree-deps";

const SESSION_CHANGED = "The session changed. Try selecting the working copy again.";

/** Throws while the session is running or already changing. */
function assertSessionSettled(deps: WorktreeDeps, current: Session | undefined): asserts current is Session {
  if (
    !current ||
    current.busy ||
    deps.removingSessionIds.current.has(current.id) ||
    deps.switchingWorktrees.current.has(current.id)
  ) {
    throw new Error("Wait for this session to finish before changing working copies.");
  }
}

/** Throws when the session cannot move to `tree` now. */
function assertCanSwitchTo(deps: WorktreeDeps, current: Session, tree: Worktree): void {
  if ([...deps.removingWorktreePaths.current].some((path) => isEqualOrInside(tree.path, path))) {
    throw new Error("This worktree is being deleted. Select another working copy.");
  }
  if (!current.worktreeRemoved && current.queuedMessages?.length) {
    throw new Error("Clear queued messages before changing working copies.");
  }
  const run = orchestrator.forSession(current.id);
  if (run && ["active", "paused"].includes(run.status)) {
    throw new Error("Stop this orchestration run before changing working copies.");
  }
}

function sameCheckout(a: Session | undefined, b: Session): a is Session {
  return !!a && a.cwd === b.cwd && sessionWorkCwd(a) === sessionWorkCwd(b);
}

/**
 * A conversation leaves its original checkout behind: it continues as a new
 * session in the worktree, in its own tab.
 */
function openInWorktree(deps: WorktreeDeps, source: Session, selected: Session, fromComposer: boolean): void {
  // Leave the original conversation, checkpoints, and live provider
  // context attached to the files they describe.
  const tab = newTab(selected.id);
  if (fromComposer) deps.workspacePins.current.set(selected.id, currentWorkspace(source.cwd));
  commitSessions(deps, [...deps.sessionsRef.current, selected]);
  deps.appendTab(tab, selected.cwd);
  deps.selectTab(tab.id);
  deps.focusComposer();
}

/** Moves a blank or detached session into `target`, saving it there. */
async function moveIntoWorktree(
  deps: WorktreeDeps,
  current: Session,
  source: Session,
  target: Worktree,
  fromComposer: boolean,
  isCurrent: () => boolean,
): Promise<void> {
  const sessionId = current.id;
  await flushSessionCheckpoint(sessionId);
  if (!isCurrent()) return;
  for (const harness of sessionChildHarnesses(source)) {
    await forgetHarnessSession(harness, sessionId);
    if (!isCurrent()) return;
  }

  const latest = deps.sessionsRef.current.find((s) => s.id === sessionId);
  if (!sameCheckout(latest, current) || (!latest.worktreeRemoved && !isBlankSession(latest))) {
    throw new Error(SESSION_CHANGED);
  }
  const next = sessionInWorktree(latest, target);
  if (fromComposer) deps.workspacePins.current.set(sessionId, currentWorkspace(latest.cwd));
  else deps.workspacePins.current.delete(sessionId);
  if (latest.worktreeRemoved) await keepSessionChanges(sessionId, target.path);
  deps.persistence.dropPending(sessionId);
  if (shouldPersistSession(next)) await upsertSession(next);
  if (!isCurrent()) return;

  deps.invalidateLoadedSession(sessionId);
  commitSessions(
    deps,
    deps.sessionsRef.current.map((s) => (s.id === sessionId ? next : s)),
  );
  notifyGitChanged();
  notifyReviewChanged(sessionId);
  void deps.refreshHistory(next.cwd);
}

/** Changes the working copy a session runs in; `isCurrent` drops a superseded change. */
export async function changeWorktree(
  deps: WorktreeDeps,
  sessionId: string,
  tree: Worktree,
  fromComposer = false,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  if (!isCurrent()) return;
  const current = deps.sessionsRef.current.find((s) => s.id === sessionId);
  assertSessionSettled(deps, current);
  if (!current.worktreeRemoved && pathKey(sessionWorkCwd(current)) === pathKey(tree.path)) return;
  assertCanSwitchTo(deps, current, tree);

  deps.switchingWorktrees.current.set(sessionId, tree.path);
  deps.persistence.dropPending(sessionId);
  try {
    const listed = await listWorktrees(current.cwd);
    if (!isCurrent()) return;
    const target = listed.worktrees.find(
      (entry) => pathKey(entry.path) === pathKey(tree.path) && !entry.missing,
    );
    if (!target) throw new Error("This worktree is no longer available. Refresh the picker.");

    const source = deps.sessionsRef.current.find((s) => s.id === sessionId);
    if (!sameCheckout(source, current) || source.busy) throw new Error(SESSION_CHANGED);
    const selected = sessionInWorktree(source, target);
    if (selected.id !== sessionId) {
      openInWorktree(deps, source, selected, fromComposer);
      return;
    }
    await moveIntoWorktree(deps, current, source, target, fromComposer, isCurrent);
  } finally {
    deps.switchingWorktrees.current.delete(sessionId);
  }
}
