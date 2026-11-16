import { orchestrationWorktreeBranchName } from "@/domain/git/worktree-branch";
import {
  orchestrationCheckoutCwd,
  orchestrationProjectCwd,
  workspaceIdentity,
} from "@/features/orchestration/model/orchestration";
import type { OrchestrationRun, OrchestrationTask } from "@/features/orchestration/model/orchestration-state";
import { createOrchestrationWorktree, listWorktrees } from "@/features/source-control/model/worktrees";
import { pathKey } from "@/shared/lib/paths";

type RetainedWorkspace = NonNullable<OrchestrationTask["workspace"]>;

/** A retried worker goes back to the worktree it kept; a missing one cannot be retried. */
async function retainedWorkspace(projectCwd: string, leadCheckoutCwd: string, retained: RetainedWorkspace) {
  const listed = await listWorktrees(leadCheckoutCwd);
  const tree = listed.worktrees.find((entry) => pathKey(entry.path) === pathKey(retained.checkoutCwd));
  if (!tree)
    throw new Error(
      "This worker's retained worktree is missing. Its saved changes cannot be retried automatically.",
    );
  return workspaceIdentity(projectCwd, tree.path, tree.branch ?? retained.branch);
}

/** Where a worker runs: the lead's checkout, its retained worktree, or a new one. */
export async function workerWorkspace(run: OrchestrationRun, task: OrchestrationTask) {
  const projectCwd = orchestrationProjectCwd(run);
  const leadCheckoutCwd = orchestrationCheckoutCwd(run);
  if (task.workspacePolicy === "shared") return workspaceIdentity(projectCwd, leadCheckoutCwd);
  if (task.workspace) return retainedWorkspace(projectCwd, leadCheckoutCwd, task.workspace);

  const tree = await createOrchestrationWorktree(leadCheckoutCwd, orchestrationWorktreeBranchName(task.id));
  return workspaceIdentity(projectCwd, tree.path, tree.branch ?? undefined);
}

export type WorkerWorkspace = Awaited<ReturnType<typeof workerWorkspace>>;
