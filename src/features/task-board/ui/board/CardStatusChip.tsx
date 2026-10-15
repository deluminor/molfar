import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle,
  CircleAlert,
  Clock,
  LoaderCircle,
  type IconComponent,
} from "../../../../shared/ui/icons";
import type { CardStatus, CardStatusKind } from "../../model/card-status";

const LOOK: Record<CardStatusKind, { icon: IconComponent; className: string }> = {
  queued: { icon: Clock, className: "text-content/55 bg-content/[0.06]" },
  running: { icon: LoaderCircle, className: "text-content/70 bg-content/[0.06]" },
  stalled: { icon: Clock, className: "text-amber-300 bg-amber-300/10" },
  needs_you: { icon: CircleAlert, className: "text-accent bg-accent/12" },
  failed: { icon: AlertCircle, className: "text-rose-300 bg-rose-400/12" },
  delivered: { icon: CheckCircle, className: "text-emerald-300 bg-emerald-400/10" },
};

export function CardStatusChip({ status }: { status: NonNullable<CardStatus> }): ReactNode {
  const { icon: Icon, className } = LOOK[status.kind];
  const motion: Partial<Record<CardStatusKind, string>> = {
    running: "animate-spin motion-reduce:animate-none",
    needs_you: "task-board-breathe",
  };

  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium tabular-nums ${className}`}
    >
      <Icon className={`size-3 ${motion[status.kind] ?? ""}`} strokeWidth={2} />
      {status.label}
    </span>
  );
}
