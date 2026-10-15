import { taskBranchName } from "../model/branch-name";
import type { Card } from "../types/card";
import { writeCard } from "./card-writer";
import type { EnginePorts } from "./ports";

/**
 * Reuses a worktree left by an interrupted earlier attempt; a branch without a
 * worktree is checked out again rather than failing on "already exists".
 */
async function attachWorktree(ports: EnginePorts, projectCwd: string, branch: string, base: string) {
  const found = await ports.git.findWorktree(projectCwd, branch);
  if (found) return found;
  try {
    return await ports.git.createWorktree(projectCwd, branch, base);
  } catch (error: unknown) {
    const retry = await ports.git.createWorktree(projectCwd, branch, base, true).catch(() => null);
    if (retry) return retry;
    throw error;
  }
}

/**
 * Gives the card its own worktree on first use and pins the base commit, so
 * every later stage diffs against the same point the work started from.
 */
export async function ensureWorktree(ports: EnginePorts, card: Card): Promise<Card> {
  if (card.worktreePath && card.baseSha && card.branch) return card;

  const base = card.baseRef ?? (await ports.git.defaultBranch(card.projectCwd));
  const branch = card.branch ?? taskBranchName(card.id, card.title);
  const tree = await attachWorktree(ports, card.projectCwd, branch, base);
  const snapshot = await ports.git.snapshot(tree.path);

  const updated = await writeCard(ports.store, card.id, () => ({
    baseRef: base,
    baseSha: snapshot.head,
    branch: tree.branch,
    worktreePath: tree.path,
  }));
  if (!updated) throw new Error("The card could not record its worktree.");
  return updated;
}

/** Removes the card's worktree; the branch stays unless `dropUnpushedBranch`. */
export async function cleanupWorktree(
  ports: EnginePorts,
  card: Card,
  options: { force: boolean; dropUnpushedBranch: boolean },
): Promise<void> {
  if (card.worktreePath)
    await ports.git.removeWorktree(card.projectCwd, card.worktreePath, options.force);
  if (options.dropUnpushedBranch && card.branch)
    await ports.git.removeBranch(card.projectCwd, card.branch);
}
