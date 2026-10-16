import { memo, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { projectName } from "../../../../shared/lib/paths";
import { GitBranch, RotateCcw } from "../../../../shared/ui/icons";
import { ProjectMark } from "../../../projects/ui/ProjectMark";
import { HarnessIcon } from "../../../sessions/ui/HarnessIcon";
import type { HarnessId } from "../../../sessions/model/session";
import { REWORK_WARNING_CYCLE } from "../../constants/limits";
import type { CardStatus, CardStatusKind } from "../../model/card-status";
import type { Card } from "../../types/card";
import { CardStatusChip } from "./CardStatusChip";

type Props = {
  card: Card;
  status: CardStatus;
  /** The harness working the card right now, if a stage runs. */
  harness: HarnessId | undefined;
  selected: boolean;
  draggable: boolean;
  dragging: boolean;
  onOpen: (cardId: string) => void;
  onDragStart: (cardId: string, event: PointerEvent<HTMLElement>) => void;
};

/** A slim inset pill plus a faint wash, so the status reads without a hard edge. */
const STRIPE: Record<CardStatusKind, { bar: string; wash: string }> = {
  queued: { bar: "bg-content/25", wash: "from-content/[0.04]" },
  running: { bar: "bg-accent/85 shadow-[0_0_8px_var(--color-accent)]", wash: "from-accent/[0.07]" },
  stalled: { bar: "bg-amber-300/85", wash: "from-amber-300/[0.07]" },
  needs_you: { bar: "bg-accent/85", wash: "from-accent/[0.07]" },
  failed: { bar: "bg-rose-400/85", wash: "from-rose-400/[0.07]" },
  delivered: { bar: "bg-emerald-400/80", wash: "from-emerald-400/[0.06]" },
};

function shortBranch(branch: string): string {
  return branch.replace(/^molfar\/task-[a-z0-9]+-?/, "") || branch;
}

/** A nested image or link would start a native drag and cancel the pointer drag. */
function preventNativeDrag(event: DragEvent): void {
  event.preventDefault();
}

function frameClass(selected: boolean, dragging: boolean): string {
  if (dragging) return "border-accent/40 opacity-40 scale-[0.98]";
  if (selected) return "border-accent/60 bg-content/[0.075] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_16%,transparent)]";
  return "border-stroke bg-content/[0.045] hover:-translate-y-px hover:border-content/20 hover:bg-content/[0.065] hover:shadow-[0_6px_18px_-8px_rgba(0,0,0,0.6)]";
}

export const BoardCard = memo(function BoardCard({
  card,
  status,
  harness,
  selected,
  draggable,
  dragging,
  onOpen,
  onDragStart,
}: Props): ReactNode {
  const reworkWarning = card.reworkCycle >= REWORK_WARNING_CYCLE;
  const running = status?.kind === "running";

  return (
    <button
      type="button"
      data-card-id={card.id}
      onClick={() => onOpen(card.id)}
      onPointerDown={draggable ? (event) => onDragStart(card.id, event) : undefined}
      onDragStart={preventNativeDrag}
      aria-label={`#${card.number} ${card.title}${status ? `, ${status.label}` : ""}`}
      className={`task-board-card group relative isolate flex w-full shrink-0 cursor-pointer flex-col gap-2 overflow-hidden rounded-xl border py-2.5 pl-3.5 pr-3 text-left outline-none transition-[background-color,border-color,opacity,transform,box-shadow] duration-200 ease-[var(--motion-ease-out)] focus-visible:ring-2 focus-visible:ring-accent/70 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${frameClass(selected, dragging)}`}
    >
      {status ? (
        <>
          <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 -z-10 w-16 bg-gradient-to-r to-transparent ${STRIPE[status.kind].wash}`} />
          <span aria-hidden className={`absolute inset-y-3 left-[5px] w-[2px] rounded-full ${STRIPE[status.kind].bar}`} />
        </>
      ) : null}

      <div className="flex items-center gap-1.5 text-[11px] text-content/45">
        <span className="font-mono tabular-nums text-content/55">#{card.number}</span>
        <span aria-hidden className="text-content/20">·</span>
        <ProjectMark path={card.projectCwd} />
        <span className="min-w-0 truncate">{projectName(card.projectCwd)}</span>
        <span className="flex-1" />
        {harness ? <HarnessIcon harness={harness} className="size-3 shrink-0 opacity-70" /> : null}
      </div>

      <div className="line-clamp-2 text-[13px] font-medium leading-[1.35] text-content">{card.title}</div>

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

      {running ? <span aria-hidden className="task-board-progress" /> : null}
    </button>
  );
});
