import type { GitDiffIndex } from "../../../platform/tauri/fs";

const SHORT_SHA_LENGTH = 7;

export type GitPulse = {
  /** Branch name, or the short head sha when detached. */
  branch: string;
  dirty: boolean;
  changedCount: number;
  ahead: number;
  behind: number;
  /** False when the branch has no upstream, so ahead/behind are meaningless. */
  tracking: boolean;
  subject: string | null;
};

/** Null when the folder is not a repository with a head commit. */
export function gitPulse(
  index: GitDiffIndex,
  headMessage: string,
): GitPulse | null {
  const branch = index.branch ?? index.head?.slice(0, SHORT_SHA_LENGTH);
  if (!branch) return null;
  const subject = headMessage.split("\n", 1)[0]?.trim() ?? "";

  return {
    branch,
    dirty: index.files.length > 0,
    changedCount: index.files.length,
    ahead: index.ahead,
    behind: index.behind,
    tracking: index.upstream != null,
    subject: subject || null,
  };
}
