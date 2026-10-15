import type { GitSnapshot } from "../../../platform/tauri/fs";

/** A read-only stage must leave HEAD and every file exactly as it found them. */
export function readOnlyViolation(before: GitSnapshot, after: GitSnapshot): string | null {
  if (before.head !== after.head) return "The stage wrote to the checkout: it created commits.";
  if (before.porcelain !== after.porcelain || before.fingerprint !== after.fingerprint)
    return "The stage wrote to the checkout: files changed.";
  return null;
}

/** A writing stage must end clean and with new commits since it started. */
export function commitViolation(headBefore: string, after: GitSnapshot): string | null {
  if (after.porcelain.trim())
    return "The stage left uncommitted changes. Commit or discard them, then retry.";
  if (after.head === headBefore) return "The stage made no new commit.";
  return null;
}

export function dirtyCheckoutError(snapshot: GitSnapshot): string | null {
  if (!snapshot.porcelain.trim()) return null;
  return "The card's worktree has uncommitted changes. Commit or discard them first.";
}
