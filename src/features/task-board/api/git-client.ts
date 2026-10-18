import { invoke } from "@tauri-apps/api/core";
import {
  gitPush,
  gitRangeDiff,
  gitSnapshot,
  type GitRangeContext,
  type GitSnapshot,
} from "@/platform/tauri/fs";
import { createWorktree, listWorktrees, removeWorktree } from "@/features/source-control/model/worktrees";

export type PullRequestInput = { title: string; body: string; base: string; head: string };

/** Git and GitHub operations the Task Board needs, over existing Tauri commands. */
export const taskGitClient = {
  defaultBranch: (cwd: string): Promise<string> => invoke("git_default_branch_name", { cwd }),
  /** `existing` checks out a branch that is already there instead of creating it from `base`. */
  createWorktree: async (
    projectCwd: string,
    branch: string,
    base: string,
    existing = false,
  ): Promise<{ path: string; branch: string }> => {
    const tree = await createWorktree(projectCwd, branch, existing ? "" : base, existing);
    return { path: tree.path, branch: tree.branch ?? branch };
  },
  findWorktree: async (projectCwd: string, branch: string): Promise<{ path: string; branch: string } | null> => {
    const { worktrees } = await listWorktrees(projectCwd);
    const tree = worktrees.find((entry) => entry.branch === branch && !entry.missing);
    return tree ? { path: tree.path, branch } : null;
  },
  removeWorktree: async (projectCwd: string, path: string, force: boolean): Promise<void> => {
    await removeWorktree(projectCwd, path, force);
  },
  removeBranch: (projectCwd: string, branch: string): Promise<boolean> =>
    invoke("git_task_branch_remove", { cwd: projectCwd, branch }),
  snapshot: (cwd: string): Promise<GitSnapshot> => gitSnapshot(cwd),
  rangeDiff: (cwd: string, base: string): Promise<GitRangeContext> => gitRangeDiff(cwd, base),
  push: (cwd: string): Promise<void> => gitPush(cwd),
  githubRepo: (cwd: string): Promise<string> => invoke("git_github_repo", { cwd }),
  createPullRequest: (cwd: string, input: PullRequestInput): Promise<string> =>
    invoke("git_pr_create", { cwd, ...input }),
  squashMerge: (cwd: string, repo: string, number: number): Promise<void> =>
    invoke("git_github_pr_action", { cwd, repo, number, action: "squash" }),
};

export type TaskGitClient = typeof taskGitClient;
