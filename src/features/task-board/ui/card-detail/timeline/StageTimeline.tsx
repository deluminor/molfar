import { flushSync } from "react-dom";
import { useRef, useState, type ReactNode } from "react";
import { COLUMN_LABEL } from "../../../constants/columns";
import { cardStatus } from "../../../model/card-status";
import { layoutTimeline } from "../../../model/stage-timeline/layout";
import type { Card } from "../../../types/card";
import type { StageRun } from "../../../types/stage";
import { CardStatusChip } from "../../board/CardStatusChip";
import { CardTimeline } from "../CardTimeline";
import { StageTimelinePreview } from "./StageTimelinePreview";
import { StageTimelineDialog } from "./StageTimelineDialog";
import "./timeline.css";

export function StageTimeline({
  card,
  runs,
  now,
  refresh,
  stallMinutes,
  needsInput,
  onOpenSession,
}: {
  card: Card;
  runs: readonly StageRun[];
  now: number;
  refresh: () => void;
  stallMinutes: number;
  needsInput: boolean;
  onOpenSession: (id: string) => void;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const layout = layoutTimeline(runs, now);
  const running = [...runs]
    .reverse()
    .find((run) => run.stage === card.columnId && run.status === "running");
  const status = cardStatus(card, running, { now, stallMinutes, needsInput });
  const summary = status ? (
    <CardStatusChip status={status} />
  ) : (
    <span>{COLUMN_LABEL[card.columnId]}</span>
  );
  const close = () => {
    flushSync(() => setExpanded(false));
    preview.current?.querySelector("button")?.focus();
  };

  return (
    <div className="min-w-0 flex flex-col gap-4" ref={preview}>
      <StageTimelinePreview
        layout={layout}
        summary={summary}
        onExpand={() => {
          refresh();
          setExpanded(true);
        }}
      />
      {runs.length ? (
        <CardTimeline runs={runs} now={now} onOpenSession={onOpenSession} />
      ) : null}
      {expanded ? (
        <StageTimelineDialog
          title={`#${card.number} ${card.title} · Stage timeline`}
          layout={layout}
          summary={summary}
          onClose={close}
          onOpenSession={onOpenSession}
        />
      ) : null}
    </div>
  );
}
