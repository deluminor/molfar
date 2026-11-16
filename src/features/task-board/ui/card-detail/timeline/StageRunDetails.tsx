import { timestamp } from "./timestamps";
import type { ReactNode } from "react";
import { COLUMN_LABEL } from "../../../constants/columns";
import { elapsedLabel } from "../../../model/card-status";
import type { TimelineRow } from "../../../model/stage-timeline/types";
import { RUN_STATUS } from "./constants";

export function StageRunDetails({ row }: { row: TimelineRow }): ReactNode {
  const { run, interval } = row;
  let completion = "Completion time unavailable";
  if (run.completedAt !== null) completion = timestamp(run.completedAt);
  else if (run.status === "running") completion = "Running";

  return (
    <section className="timeline-details text-[12px]" aria-label="Run details">
      <strong>
        {COLUMN_LABEL[run.stage]}
        {run.attempt > 1 ? ` · attempt ${run.attempt}` : ""}
      </strong>
      <p>
        {RUN_STATUS[run.status].label} ·{" "}
        {interval ? elapsedLabel(interval.duration) : "Timing unavailable"}
      </p>
      <p className="break-all">
        {run.harness} · {run.model}
      </p>
      <p>Started: {timestamp(run.startedAt)}</p>
      <p>Completed: {completion}</p>
      {run.error && run.status !== "succeeded" ? (
        <p className="whitespace-pre-wrap break-words text-rose-300">
          {run.error}
        </p>
      ) : null}
    </section>
  );
}
