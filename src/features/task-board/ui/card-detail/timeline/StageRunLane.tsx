import type { ReactNode } from "react";
import { COLUMN_LABEL } from "../../../constants/columns";
import { COLUMN_LOOK } from "../../../constants/column-look";
import { elapsedLabel } from "../../../model/card-status";
import type { TimelineRow } from "../../../model/stage-timeline/types";
import { RUN_STATUS } from "./constants";

export function StageRunLane({
  row,
  onInspect,
  onOpen,
}: {
  row: TimelineRow;
  onInspect: (id: string, anchor?: HTMLElement) => void;
  onOpen: (sessionId: string) => void;
}): ReactNode {
  const { run, interval } = row;
  const look = RUN_STATUS[run.status];
  const Icon = COLUMN_LOOK[run.stage].icon;
  const label = `${COLUMN_LABEL[run.stage]}${run.attempt > 1 ? ` attempt ${run.attempt}` : ""}`;
  const inspect = (
    event: React.FocusEvent<HTMLElement> | React.PointerEvent<HTMLElement>,
  ) => onInspect(run.id, event.currentTarget);
  const open = () => {
    if (run.sessionId) onOpen(run.sessionId);
  };
  const select = () => onInspect(run.id);
  const activate = run.sessionId ? open : select;
  const actionLabel = run.sessionId
    ? `Open ${label} session`
    : `Inspect ${label} interval`;
  const style = interval
    ? { left: `${interval.left}%`, width: `${interval.width}%` }
    : undefined;

  return (
    <div className="timeline-lane" data-run-id={run.id}>
      <div className="timeline-label">
        <button
          type="button"
          className="timeline-control flex items-center gap-1"
          onFocus={inspect}
          onPointerEnter={inspect}
          onClick={select}
          aria-label={`Inspect ${label}`}
        >
          <Icon className="size-3 shrink-0" />
          {label}
        </button>
        <div className={`text-[11px] ${look.text}`}>
          {look.label} ·{" "}
          {interval ? elapsedLabel(interval.duration) : "Timing unavailable"}
        </div>
        <div
          className="truncate text-[11px] text-content/50"
          title={`${run.harness} · ${run.model}`}
        >
          {run.harness} · {run.model}
        </div>
        {row.completionUnavailable ? (
          <div className="text-[10px]">Completion time unavailable</div>
        ) : null}
      </div>
      <div className="timeline-track">
        {interval ? (
          <button
            type="button"
            aria-label={actionLabel}
            onFocus={inspect}
            onPointerEnter={inspect}
            onClick={activate}
            style={style}
            className={`timeline-bar ${look.dot}`}
          />
        ) : (
          <span className="text-[11px]">Timing unavailable</span>
        )}
      </div>
      <div className="flex items-center justify-center">
        {run.sessionId ? (
          <button
            type="button"
            className="timeline-control min-h-8 min-w-8"
            aria-label={`Open ${label} session control`}
            onClick={open}
          >
            Open
          </button>
        ) : null}
      </div>
    </div>
  );
}
