import type { Session } from "@/domain/session/session";
import {
  listWorktrees,
  worktreeSessionIds,
} from "@/features/source-control/model/worktrees";
import { pathKey } from "@/shared/lib/paths";

type WorktreeOwner = Pick<Session, "cwd" | "worktreeCwd">;

/**
 * The worktree a session's deletion may also remove: a linked, unlocked
 * branch checkout that no other open session uses. Undefined when there is
 * none or the lookup fails.
 */
export async function findUnusedSessionWorktree(
  sessionId: string,
  owner: WorktreeOwner | undefined,
  openSessions: readonly Session[],
  list: typeof listWorktrees = listWorktrees,
): Promise<string | undefined> {
  const worktreeCwd = owner?.worktreeCwd;
  if (!owner || !worktreeCwd) return undefined;

  try {
    const { worktrees } = await list(owner.cwd);
    const tree = worktrees.find(
      (entry) => pathKey(entry.path) === pathKey(worktreeCwd),
    );
    const removable = tree && !tree.isMain && !tree.locked && tree.branch;
    if (!removable) return undefined;

    const onlyThisSession = worktreeSessionIds(tree, openSessions).every(
      (id) => id === sessionId,
    );
    return onlyThisSession ? tree.path : undefined;
  } catch {
    // A failed lookup must never offer filesystem cleanup.
    return undefined;
  }
}
