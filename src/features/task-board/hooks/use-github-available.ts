import { useEffect, useState } from "react";
import type { GitPort } from "../services/ports";

/** Whether delivery can open pull requests for this worktree; null while checking. */
export function useGithubAvailable(git: GitPort, worktree: string | null): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!worktree) return;
    let alive = true;
    git
      .githubRepo(worktree)
      .then(() => alive && setAvailable(true))
      .catch((error: unknown) => {
        console.error("Task board: GitHub repository lookup failed", { worktree, error });
        if (alive) setAvailable(false);
      });
    return () => {
      alive = false;
    };
  }, [git, worktree]);

  return available;
}
