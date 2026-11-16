import { namedWorktreeBranch, temporaryWorktreeBranchName } from "@/domain/git/worktree-branch";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { notifyReviewChanged } from "@/features/sessions/model/checkpoint";
import { createWorktree, renameWorktreeBranch } from "@/features/source-control/model/worktrees";
import { generateHarnessBranchName, pickTextHarness } from "@/integrations/harness";
import { pathKey } from "@/shared/lib/paths";
import { currentWorkspace } from "../../../model/current-workspace";
import type { TurnContext } from "./turn-run";

/** Creates the worktree a draft session asked for and names its branch after the message. */
export async function prepareDraftWorktree({ deps, turn, run }: TurnContext): Promise<void> {
  const { sessionId, current, attachments } = turn;
  const tree = await createWorktree(
    current.cwd,
    temporaryWorktreeBranchName(),
    current.worktreeBase || "HEAD",
    false,
  );
  run.workCwd = tree.path;
  deps.workspacePins.current.set(sessionId, currentWorkspace(current.cwd));
  if (run.proposalDraft) run.proposalDraft = { ...run.proposalDraft, checkoutCwd: tree.path };
  deps.setSessions((prev) =>
    prev.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            worktreeCwd: tree.path,
            branch: tree.branch ?? undefined,
            workspaceMode: undefined,
            worktreeBase: undefined,
            worktreePreparing: undefined,
          }
        : session,
    ),
  );
  notifyReviewChanged(sessionId);

  const branchMessage = turn.harnessText || attachments.map((file) => file.name).join(", ");
  void generateHarnessBranchName(pickTextHarness(current.harness), run.workCwd, branchMessage)
    .then(async (fragment) => {
      const branch = fragment ? namedWorktreeBranch(fragment) : null;
      if (!branch) return;
      const renamed = await renameWorktreeBranch(current.cwd, tree.path, branch);
      deps.setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId && pathKey(sessionWorkCwd(session)) === pathKey(tree.path)
            ? { ...session, branch: renamed.branch ?? undefined }
            : session,
        ),
      );
    })
    .catch(() => undefined);
}
