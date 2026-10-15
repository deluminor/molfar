import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { GitRangeContext } from "../../../../platform/tauri/fs";
import { InboxPrDiff } from "../../../inbox/ui/InboxPrDiff";
import type { GithubPrDiff } from "../../../inbox/model/githubTasks";
import { parsePrPatch } from "../../../source-control/model/prDiff";
import type { GitPort } from "../../services/ports";

type Props = { git: GitPort; worktree: string | null; baseSha: string | null };

/** The card's whole change since it started, rendered like a pull request. */
export function CardDiff({ git, worktree, baseSha }: Props): ReactNode {
  const [range, setRange] = useState<GitRangeContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!worktree || !baseSha) return;
    let alive = true;
    git
      .rangeDiff(worktree, baseSha)
      .then((next) => alive && setRange(next))
      .catch((reason: unknown) => alive && setError(String(reason)));
    return () => {
      alive = false;
    };
  }, [git, worktree, baseSha]);

  const diff = useMemo<GithubPrDiff | null>(() => {
    if (!range) return null;
    const files = parsePrPatch(range.diffPatch);
    return {
      additions: files.reduce((sum, file) => sum + file.additions, 0),
      deletions: files.reduce((sum, file) => sum + file.deletions, 0),
      files: [],
      patch: range.diffPatch,
      truncated: false,
    };
  }, [range]);

  if (!worktree || !baseSha) return <p className="p-4 text-[13px] text-content/40">No worktree yet.</p>;
  if (error)
    return (
      <p role="alert" className="p-4 text-[12px] text-rose-300">
        {error}
      </p>
    );
  if (!diff) return <p className="p-4 text-[13px] text-content/40">Loading diff…</p>;
  if (!diff.patch.trim()) return <p className="p-4 text-[13px] text-content/40">No changes since the base commit.</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {range?.commitSummary.trim() ? (
        <pre className="mb-3 whitespace-pre-wrap rounded-lg bg-content/[0.03] px-3 py-2 font-mono text-[12px] text-content/60">
          {range.commitSummary.trim()}
        </pre>
      ) : null}
      <InboxPrDiff diff={diff} />
    </div>
  );
}
