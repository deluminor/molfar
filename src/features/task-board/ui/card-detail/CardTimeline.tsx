import type { ReactNode } from "react";
import { HARNESS_LABEL } from "../../../sessions/model/session";
import { ExternalLink } from "../../../../shared/ui/icons";
import { COLUMN_LABEL } from "../../constants/columns";
import { elapsedLabel } from "../../model/card-status";
import type { StageRun, StageStatus } from "../../types/stage";

const STATUS_TONE: Record<StageStatus, string> = {
  running: "text-content/70",
  succeeded: "text-emerald-300",
  failed: "text-rose-300",
  cancelled: "text-content/45",
  interrupted: "text-amber-300",
};

const LABELS: Readonly<Record<string, string>> = HARNESS_LABEL;

function harnessLabel(harness: string): string {
  return LABELS[harness] ?? harness;
}

type Props = { runs: readonly StageRun[]; now: number; onOpenSession: (sessionId: string) => void };

/** Every stage run of the card, oldest first, with a way into its session. */
export function CardTimeline({ runs, now, onOpenSession }: Props): ReactNode {
  if (runs.length === 0) return <p className="text-[12px] text-content/40">No stage has run yet.</p>;

  return (
    <ol className="flex flex-col gap-1.5">
      {runs.map((run) => (
        <li key={run.id} className="flex items-center gap-2 rounded-lg bg-content/[0.03] px-2.5 py-2 text-[12px]">
          <span className="w-24 shrink-0 text-content/80">
            {COLUMN_LABEL[run.stage]}
            {run.attempt > 1 ? <span className="text-content/40"> #{run.attempt}</span> : null}
          </span>
          <span className={`w-20 shrink-0 capitalize ${STATUS_TONE[run.status]}`}>{run.status}</span>
          <span className="min-w-0 flex-1 truncate text-content/45">
            {harnessLabel(run.harness)} · {run.model}
          </span>
          <span className="shrink-0 tabular-nums text-content/40">
            {elapsedLabel((run.completedAt ?? now) - run.startedAt)}
          </span>
          {run.sessionId ? (
            <button
              type="button"
              aria-label="Open session"
              title="Open session"
              onClick={() => run.sessionId && onOpenSession(run.sessionId)}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-content/45 hover:bg-content/[0.08] hover:text-content"
            >
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
