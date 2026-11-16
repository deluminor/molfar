import type { ReactNode } from "react";
import type { TimelineLayout } from "../../../model/stage-timeline/types";
import { elapsedLabel } from "../../../model/card-status";
import { RUN_STATUS } from "./constants";

export function StageTimelinePreview({
  layout,
  summary,
  onExpand,
}: {
  layout: TimelineLayout;
  summary: ReactNode;
  onExpand: () => void;
}): ReactNode {
  if (!layout.rows.length) return <p>No stage has run yet.</p>;

  return (
    <section className="stage-timeline-preview rounded-xl border border-stroke p-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium">Stage timeline</h3>
        <button type="button" onClick={onExpand} className="timeline-control">
          Expand timeline
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 py-2 text-[11px] tabular-nums">
        <span>
          {layout.totalElapsed === null
            ? "Timing unavailable"
            : `Total elapsed ${elapsedLabel(layout.totalElapsed)}`}
        </span>
        {summary}
      </div>
      <div aria-hidden="true" className="timeline-preview-tracks">
        {layout.rows.map(({ run, interval }) => (
          <div className="timeline-mini-track" key={run.id}>
            {interval ? (
              <span
                className={`timeline-bar ${RUN_STATUS[run.status].dot}`}
                style={{
                  left: `${interval.left}%`,
                  width: `${interval.width}%`,
                }}
              />
            ) : (
              <span className="text-[10px]">Timing unavailable</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
