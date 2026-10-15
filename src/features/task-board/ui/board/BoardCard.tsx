import { memo, type DragEvent, type ReactNode } from "react";
import { projectName } from "../../../../shared/lib/paths";
import { GitBranch, RotateCcw } from "../../../../shared/ui/icons";
import { ProjectLogoIcon } from "../../../projects/ui/ProjectLogoIcon";
import { REWORK_WARNING_CYCLE } from "../../constants/limits";
import type { CardStatus } from "../../model/card-status";
import type { Card } from "../../types/card";
import { CardStatusChip } from "./CardStatusChip";

type Props = {
  card: Card;
  status: CardStatus;
  selected: boolean;
  draggable: boolean;
  dragging: boolean;
  onOpen: (cardId: string) => void;
  onDragStart: (cardId: string, event: DragEvent) => void;
  onDragEnd: () => void;
};

function shortBranch(branch: string): string {
  return branch.replace(/^molfar\/task-[a-z0-9]+-?/, "") || branch;
}

export const BoardCard = memo(function BoardCard({
  card,
  status,
  selected,
  draggable,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: Props): ReactNode {
  const reworkWarning = card.reworkCycle >= REWORK_WARNING_CYCLE;
  const tone = selected
    ? "border-accent/60 bg-content/[0.07]"
    : "border-stroke bg-content/[0.03] hover:border-content/20 hover:bg-content/[0.05]";

  return (
    <button
      type="button"
      data-card-id={card.id}
      draggable={draggable}
      onClick={() => onOpen(card.id)}
      onDragStart={(event) => onDragStart(card.id, event)}
      onDragEnd={onDragEnd}
      aria-label={`#${card.number} ${card.title}${status ? `, ${status.label}` : ""}`}
      className={`group flex w-full cursor-pointer flex-col gap-2 rounded-xl border p-3 text-left outline-none transition-[background-color,border-color,opacity,transform] duration-150 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-accent/70 ${tone} ${dragging ? "scale-[0.98] opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2 text-[11px] text-content/45">
        <span className="font-mono tabular-nums">#{card.number}</span>
        <ProjectLogoIcon path={card.projectCwd} className="size-3 shrink-0" />
        <span className="min-w-0 truncate">{projectName(card.projectCwd)}</span>
      </div>

      <div className="line-clamp-2 text-[13px] font-medium leading-snug text-content">{card.title}</div>

      <div className="flex min-h-5 flex-wrap items-center gap-1.5">
        {status ? <CardStatusChip status={status} /> : null}
        {card.reworkCycle > 0 ? (
          <span
            title={`Rework cycle ${card.reworkCycle}`}
            className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] tabular-nums ${reworkWarning ? "bg-amber-300/10 text-amber-300" : "bg-content/[0.06] text-content/55"}`}
          >
            <RotateCcw className="size-3" strokeWidth={2} />
            {card.reworkCycle}
          </span>
        ) : null}
        {card.branch ? (
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-content/40">
            <GitBranch className="size-3 shrink-0" strokeWidth={1.75} />
            <span className="truncate font-mono">{shortBranch(card.branch)}</span>
          </span>
        ) : null}
      </div>
    </button>
  );
});
