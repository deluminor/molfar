import type { ReactNode } from "react";
import { ExternalLink } from "../../../../shared/ui/icons";
import { HARNESS_LABEL, HARNESSES } from "../../../sessions/model/session";
import { HarnessIcon } from "../../../sessions/ui/HarnessIcon";
import { COLUMN_LABEL } from "../../constants/columns";
import { COLUMN_LOOK } from "../../constants/column-look";
import { elapsedLabel } from "../../model/card-status";
import type { StageRun, StageStatus } from "../../types/stage";

const STATUS: Record<StageStatus, { label: string; dot: string; text: string }> = {
  running: { label: "Running", dot: "bg-accent task-board-breathe", text: "text-accent" },
  succeeded: { label: "Succeeded", dot: "bg-emerald-400", text: "text-emerald-300" },
  failed: { label: "Failed", dot: "bg-rose-400", text: "text-rose-300" },
  cancelled: { label: "Cancelled", dot: "bg-content/30", text: "text-content/45" },
  interrupted: { label: "Interrupted", dot: "bg-amber-300", text: "text-amber-300" },
};

function Step({ run, now, last, onOpenSession }: { run: StageRun; now: number; last: boolean; onOpenSession: (sessionId: string) => void }): ReactNode {
  const look = STATUS[run.status];
  const Icon = COLUMN_LOOK[run.stage].icon;
  const harness = HARNESSES.find((entry) => entry === run.harness);
  const openSession = () => {
    if (run.sessionId) onOpenSession(run.sessionId);
  };

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {last ? null : <span aria-hidden className="absolute left-[11px] top-6 bottom-0 w-px bg-stroke" />}
      <span className="relative grid size-6 shrink-0 place-items-center rounded-full border border-stroke bg-content/[0.04]">
        <Icon className="size-3 text-content/60" strokeWidth={2} />
        <span aria-hidden className={`absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-[var(--color-background-base)] ${look.dot}`} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-1 pt-0.5">
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="font-medium text-content/90">{COLUMN_LABEL[run.stage]}</span>
          {run.attempt > 1 ? <span className="text-content/40">attempt {run.attempt}</span> : null}
          <span className={`text-[11.5px] ${look.text}`}>{look.label}</span>
          <span className="flex-1" />
          <span className="text-[11.5px] tabular-nums text-content/40">{elapsedLabel((run.completedAt ?? now) - run.startedAt)}</span>
          {run.sessionId ? (
            <button
              type="button"
              aria-label="Open session"
              title="Open session"
              onClick={openSession}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-content/45 transition-colors duration-150 hover:bg-content/[0.08] hover:text-content"
            >
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-content/45">
          {harness ? <HarnessIcon harness={harness} className="size-3 shrink-0" /> : null}
          <span className="truncate">
            {harness ? HARNESS_LABEL[harness] : run.harness} · {run.model}
          </span>
        </div>
        {run.error && run.status !== "succeeded" ? (
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap rounded-md bg-rose-500/[0.07] px-2 py-1 text-[11.5px] text-rose-300/90">{run.error}</p>
        ) : null}
      </div>
    </li>
  );
}

/** Every stage run of the card, oldest first, as a vertical timeline with a way into each session. */
export function CardTimeline({ runs, now, onOpenSession }: { runs: readonly StageRun[]; now: number; onOpenSession: (sessionId: string) => void }): ReactNode {
  if (runs.length === 0) return <p className="text-[12px] text-content/40">No stage has run yet.</p>;

  return (
    <ol className="flex flex-col">
      {runs.map((run, index) => (
        <Step key={run.id} run={run} now={now} last={index === runs.length - 1} onOpenSession={onOpenSession} />
      ))}
    </ol>
  );
}
