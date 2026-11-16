import {
  gitCommit,
  gitDiffFiles,
  gitDiffIndex,
  gitFileDiff,
  gitPrCreate,
  gitPrStatus,
  gitPush,
  gitStageAll,
  gitStageFile,
  gitSync,
  gitUnstageAll,
  gitUnstageFile,
  notifyGitChanged,
} from "@/platform/tauri/fs";
import {
  generateCommitMessage,
  generatePrContent,
} from "@/integrations/harness";
import { remotePrContent } from "@/features/source-control/ui/GitChangesPanel";
import { recordInboxSelfActivity } from "@/features/inbox/model/inbox-self-activity";
import { buildUnifiedFile } from "@/features/source-control/model/unified-diff";
import { highlightDiffForMobile } from "./mobile-highlight";
import { isRemoteProjectPath } from "@/features/projects/model/recents";
import { HARNESSES, type HarnessId } from "@/domain/harness/harness";
import { mobileRoot } from "./mobile-files";

/** The uncommitted changes in the project's checkout, or in one of its
 *  worktrees when the phone names it. */
export async function mobileProjectChanges(
  projectId: string,
  worktreePath?: string,
) {
  const path = await mobileRoot(projectId, worktreePath);
  const index = await gitDiffFiles(path);
  let budget = 1_000_000;
  const files = [];
  for (const file of index.files) {
    let lines: (ReturnType<typeof buildUnifiedFile>["lines"][number] & {
      runs?: [string, number][];
    })[] = [];
    let palette: string[] | undefined;
    if (budget > 0 && files.length < 30) {
      const diff = await gitFileDiff(
        path,
        file.relative,
        file.unstaged ? "unstaged" : "staged",
      ).catch(() => null);
      if (
        diff &&
        !diff.binary &&
        !diff.tooLarge &&
        diff.original.length + diff.current.length <= budget
      ) {
        budget -= diff.original.length + diff.current.length;
        lines = buildUnifiedFile(diff.original, diff.current).lines;
        // Its syntax colours too; the diff is still worth sending without them.
        const highlighted = await highlightDiffForMobile(
          file.relative,
          diff.original,
          diff.current,
          lines,
        );
        if (highlighted) ({ lines, palette } = highlighted);
      }
    }
    files.push({
      relative: file.relative,
      status: ["added", "deleted", "untracked"].includes(file.status)
        ? file.status
        : "modified",
      additions: file.additions,
      deletions: file.deletions,
      staged: file.staged,
      unstaged: file.unstaged,
      lines,
      ...(palette ? { palette } : {}),
    });
  }
  // Echoes the worktree, so the phone can tell these changes are the ones it asked for.
  return {
    branch: index.branch ?? "",
    files,
    ...(worktreePath ? { worktreePath } : {}),
  };
}

/** What the phone's commit sheet needs to offer what the desktop's Changes
 *  panel would: whether there is a remote, how the branch stands against it
 *  and the default branch, and its open pull request. */
export async function mobileProjectGit(
  projectId: string,
  worktreePath?: string,
) {
  const cwd = await mobileRoot(projectId, worktreePath);
  const [index, pr] = await Promise.all([
    gitDiffIndex(cwd),
    gitPrStatus(cwd).catch(() => null),
  ]);
  return {
    branch: index.branch ?? "",
    files: index.files.length,
    remote: Boolean(index.remote),
    upstream: Boolean(index.upstream),
    defaultBranch: index.defaultBranch ?? "",
    ahead: index.ahead,
    behind: index.behind,
    aheadOfDefault: index.aheadOfDefault,
    canGenerate: !isRemoteProjectPath(cwd),
    pr: pr?.state === "open" ? { number: pr.number, url: pr.url } : null,
  };
}

/**
 * A Changes page action from the phone, as the desktop's Changes panel runs
 * it: staging, then committing what is staged, pushing and pull requests.
 */
export async function mobileProjectGitAction(
  projectId: string,
  worktreePath: string | undefined,
  params: Record<string, unknown>,
): Promise<{ message?: string; url?: string }> {
  const cwd = await mobileRoot(projectId, worktreePath);
  // The harness picked in the phone's composer writes the commit message and
  // pull request, as the desktop's panel uses its session's.
  const harness = HARNESSES.find((id) => id === params.harness);
  const paths = Array.isArray(params.paths)
    ? params.paths.filter((path): path is string => typeof path === "string")
    : [];
  const recordPush = async () => {
    const pr = await gitPrStatus(cwd).catch(() => null);
    if (pr) recordPrActivity(cwd, pr.number);
  };
  try {
    switch (params.action) {
      case "stage":
      case "unstage": {
        const run = params.action === "stage" ? gitStageFile : gitUnstageFile;
        for (const path of paths) await run(cwd, path);
        return {};
      }
      case "stageAll":
        await gitStageAll(cwd);
        return {};
      case "unstageAll":
        await gitUnstageAll(cwd);
        return {};
      case "generate": {
        if (isRemoteProjectPath(cwd))
          throw new Error(
            "Commit messages can't be generated for remote projects",
          );
        return { message: await generateCommitMessage(cwd, harness) };
      }
      case "commit": {
        const message =
          typeof params.message === "string" ? params.message : "";
        await gitCommit(cwd, message, false);
        if (params.push !== true && params.createPr !== true) return {};
        await gitPush(cwd);
        await recordPush();
        return params.createPr === true
          ? { url: await createMobilePr(cwd, harness) }
          : {};
      }
      case "sync": {
        const pushes = (await gitDiffIndex(cwd)).ahead > 0;
        await gitSync(cwd);
        if (pushes) await recordPush();
        return {};
      }
      case "pr": {
        if ((await gitDiffIndex(cwd)).ahead > 0) await gitPush(cwd);
        return { url: await createMobilePr(cwd, harness) };
      }
      default:
        throw new Error("Unsupported git action");
    }
  } finally {
    notifyGitChanged();
  }
}

async function createMobilePr(cwd: string, harness?: HarnessId) {
  const content = isRemoteProjectPath(cwd)
    ? await remotePrContent(cwd)
    : await generatePrContent(cwd, harness);
  if (!content) throw new Error("Could not prepare pull request content");
  const url = (
    await gitPrCreate(
      cwd,
      content.title,
      content.body,
      content.base,
      content.head,
    )
  ).trim();
  const number = Number(/\/pull\/(\d+)(?:[/?#]|$)/.exec(url)?.[1]);
  if (Number.isInteger(number) && number > 0) recordPrActivity(cwd, number);
  return url;
}

function recordPrActivity(cwd: string, number: number) {
  recordInboxSelfActivity({
    provider: "github",
    kind: "pr",
    number,
    projectPath: cwd,
  });
}
