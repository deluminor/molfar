import type { Session, WorkspaceMode } from "@/domain/session/session";
import { isBlankSession } from "@/features/projects/model/project-return";
import { notifyReviewChanged } from "@/features/sessions/model/checkpoint";
import { forgetHarnessSession } from "@/integrations/harness";
import { notifyGitChanged } from "@/platform/tauri/fs";
import type { WorktreeDeps } from "./worktree-deps";

/** A blank session, or a draft whose worktree is not created yet, may still pick its checkout. */
function checkoutOpen(session: Session): boolean {
  return (
    isBlankSession(session) ||
    (!!session.workspaceMode && !session.worktreeCwd && !session.busy)
  );
}

/** The branch changed under the session: its provider session no longer matches the files. */
export function changeBranch(deps: WorktreeDeps, sessionId: string): void {
  notifyGitChanged();
  const current = deps.sessionsRef.current.find((s) => s.id === sessionId);
  if (!current) return;

  void forgetHarnessSession(current.harness, sessionId);
  const next = { ...current, branch: undefined, providerSessionId: undefined, context: undefined };
  deps.sessionsRef.current = deps.sessionsRef.current.map((s) => (s.id === sessionId ? next : s));
  deps.setSessions((prev) => prev.map((s) => (s.id === sessionId ? next : s)));
  deps.persistence.persist(next);
  notifyReviewChanged(sessionId);
}

/** Chooses whether a new session runs in the project or in a new worktree from `base`. */
export function changeWorkspaceMode(
  deps: WorktreeDeps,
  sessionId: string,
  mode: WorkspaceMode,
  base?: string,
): void {
  deps.setSessions((prev) =>
    prev.map((session) => {
      if (session.id !== sessionId || !checkoutOpen(session)) return session;
      if (mode !== "worktree") {
        return { ...session, workspaceMode: undefined, worktreeBase: undefined };
      }
      const worktreeBase = base || session.worktreeBase;
      return worktreeBase ? { ...session, workspaceMode: "worktree", worktreeBase } : session;
    }),
  );
}

export function changeWorktreeBase(deps: WorktreeDeps, sessionId: string, base: string): void {
  deps.setSessions((prev) =>
    prev.map((session) =>
      session.id === sessionId && checkoutOpen(session) && session.workspaceMode === "worktree"
        ? { ...session, worktreeBase: base }
        : session,
    ),
  );
}
