import { invoke } from "@tauri-apps/api/core";
import {
  orchestrationCheckoutCwd,
  orchestrationProjectCwd,
} from "@/features/orchestration/model/orchestration";
import type { OrchestrationRun, OrchestrationTask } from "@/features/orchestration/model/orchestration-state";
import { sameProjectPath } from "@/features/projects/model/recents";
import {
  flushSessionWrites,
  type SessionSummary,
  shouldPersistSession,
  upsertSession,
} from "@/features/sessions/data/session-store";
import {
  applySessionCheckpoint,
  flushSessionCheckpoint,
  forgetSessionCheckpoint,
  notifyReviewChanged,
  sessionCheckpointCleanupSafe,
} from "@/features/sessions/model/checkpoint";
import { sessionChildHarnesses } from "@/features/sessions/model/handoff";
import {
  detachSessionWorktree,
  listWorktrees,
  removeOrchestrationBranch,
  removeOrchestrationWorktree,
} from "@/features/source-control/model/worktrees";
import { forgetHarnessSession, stopHarnessSession } from "@/integrations/harness";
import { pathKey } from "@/shared/lib/paths";
import { commitSessions, findSession, type WorkerDeps } from "./worker-deps";

/** Stops the worker's agent processes, including ones a renderer reload left behind. */
async function reapWorker(deps: WorkerDeps, sessionId: string): Promise<void> {
  const session = findSession(deps, sessionId);
  if (session)
    await Promise.all(sessionChildHarnesses(session).map((harness) => stopHarnessSession(harness, sessionId)));
  await invoke("harness_kill", { sessionId });
  await invoke("control_turn_finished", { sessionId });
}

/** The worker's and the lead's worktrees, as git lists them now. */
async function checkoutTrees(run: OrchestrationRun, path: string, match: (a: string, b: string) => boolean) {
  const leadCwd = orchestrationCheckoutCwd(run);
  const listed = await listWorktrees(leadCwd);
  return {
    workerTree: listed.worktrees.find((tree) => match(tree.path, path)),
    leadTree: listed.worktrees.find((tree) => sameProjectPath(tree.path, leadCwd)),
  };
}

/** Applies the worker's changes onto the lead's checkout, if neither branch moved. */
export async function integrateWorker(deps: WorkerDeps, run: OrchestrationRun, task: OrchestrationTask) {
  const fromCwd = task.workspace?.checkoutCwd;
  if (!fromCwd) throw new Error("This worker's isolated checkout is unavailable");
  await reapWorker(deps, task.sessionId);
  await flushSessionCheckpoint(task.sessionId);

  const { workerTree, leadTree } = await checkoutTrees(run, fromCwd, sameProjectPath);
  if (!workerTree || !leadTree)
    throw new Error("The worker or lead checkout is no longer registered. The worker worktree was kept.");
  if (workerTree.head !== leadTree.head)
    throw new Error(
      "The worker or lead branch moved while this task was running. The worker worktree was kept for manual review.",
    );
  return applySessionCheckpoint(task.sessionId, fromCwd, orchestrationCheckoutCwd(run));
}

/** Deletes the worker's worktree and detaches every session that used it. */
async function removeWorkerWorktree(deps: WorkerDeps, run: OrchestrationRun, task: OrchestrationTask, path: string) {
  deps.stop(task.sessionId, true);
  const session = findSession(deps, task.sessionId);
  await reapWorker(deps, task.sessionId);
  await flushSessionWrites();
  deps.checkOpenWorktreeFiles(path);
  const removed = await removeOrchestrationWorktree(orchestrationCheckoutCwd(run), path);

  const affected = new Set([task.sessionId, ...removed.sessionIds]);
  commitSessions(
    deps,
    deps.sessionsRef.current.map((entry) =>
      affected.has(entry.id) ? detachSessionWorktree(entry, removed.projectCwd, path) : entry,
    ),
  );
  const detachSummary = (entry: SessionSummary) =>
    affected.has(entry.id) ? detachSessionWorktree(entry, removed.projectCwd, path) : entry;
  const { setHistory, setStoredLinkedSessions } = deps.store.getState();
  setHistory((current) => current.map(detachSummary));
  setStoredLinkedSessions((current) => current.map(detachSummary));
  if (session)
    await Promise.allSettled(
      sessionChildHarnesses(session).map((harness) => forgetHarnessSession(harness, task.sessionId)),
    );
}

/** The worktree is already gone: the worker is detached back to the project. */
async function detachGoneWorker(deps: WorkerDeps, run: OrchestrationRun, task: OrchestrationTask, path: string) {
  const detached = findSession(deps, task.sessionId);
  if (!detached || detached.worktreeRemoved) return;
  const next = detachSessionWorktree(detached, orchestrationProjectCwd(run), path);
  commitSessions(
    deps,
    deps.sessionsRef.current.map((entry) => (entry.id === task.sessionId ? next : entry)),
  );
  if (shouldPersistSession(next)) await upsertSession(next);
}

/**
 * Removes a finished worker's worktree and branch. False when unreviewed
 * changes require the worktree to be kept (`onlyIfUnchanged`).
 */
export async function cleanupWorker(
  deps: WorkerDeps,
  run: OrchestrationRun,
  task: OrchestrationTask,
  onlyIfUnchanged: boolean,
): Promise<boolean> {
  const workspace = task.workspace;
  if (workspace?.kind !== "worktree") return true;
  const path = workspace.checkoutCwd;
  await flushSessionCheckpoint(task.sessionId);
  const { workerTree, leadTree } = await checkoutTrees(run, path, (a, b) => pathKey(a) === pathKey(b));
  const exists = !!workerTree;
  if (!exists && onlyIfUnchanged) return false;
  if (exists && (!leadTree || workerTree.head !== leadTree.head)) {
    if (onlyIfUnchanged) return false;
    throw new Error(
      "The worker or lead branch moved before cleanup. The worker worktree was kept for manual review.",
    );
  }

  if (onlyIfUnchanged) {
    if (!(await sessionCheckpointCleanupSafe(task.sessionId, path))) return false;
  } else if (exists) {
    // Re-verify immediately before destructive cleanup. The operation is
    // idempotent, so this also finishes a partially applied integration.
    await applySessionCheckpoint(task.sessionId, path, orchestrationCheckoutCwd(run));
  }

  if (exists) await removeWorkerWorktree(deps, run, task, path);
  else await detachGoneWorker(deps, run, task, path);
  if (workspace.branch) await removeOrchestrationBranch(orchestrationCheckoutCwd(run), workspace.branch);
  await forgetSessionCheckpoint(task.sessionId);
  notifyReviewChanged(task.sessionId);
  return true;
}
