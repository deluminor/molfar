import type { ReactNode } from "react";
import { projectName } from "@/shared/lib/paths";
import { GitBranch } from "@/shared/ui/icons";
import { ProjectMark } from "@/features/projects/ui/ProjectMark";
import { COLUMN_LABEL } from "../../constants/columns";
import { COLUMN_LOOK, KIND_TONE } from "../../constants/column-look";
import { cardStatus } from "../../model/card-status";
import type { Card } from "../../types/card";
import type { StageRun } from "../../types/stage";
import { CardStatusChip } from "../board/CardStatusChip";

/** Where the card is and what it is doing, under the panel title. */
export function CardMeta({ card, runs }: { card: Card; runs: readonly StageRun[] }): ReactNode {
  const { icon: Icon, kind } = COLUMN_LOOK[card.columnId];
  const running = runs.filter((run) => run.status === "running").pop();
  const status = cardStatus(card, running, { now: Date.now(), stallMinutes: Number.POSITIVE_INFINITY, needsInput: false });

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-4 pb-2.5 pt-3 text-[11.5px]">
      <span className={`inline-flex h-5 items-center gap-1 rounded-md px-1.5 font-medium ${KIND_TONE[kind]}`}>
        <Icon className="size-3" strokeWidth={2} />
        {COLUMN_LABEL[card.columnId]}
      </span>
      {status ? <CardStatusChip status={status} /> : null}
      {card.archived ? <span className="inline-flex h-5 items-center rounded-md bg-content/[0.06] px-1.5 text-content/55">Archived</span> : null}
      <span className="inline-flex h-5 min-w-0 items-center gap-1 px-1 text-content/55">
        <ProjectMark path={card.projectCwd} />
        <span className="truncate">{projectName(card.projectCwd)}</span>
      </span>
      {card.branch ? (
        <span className="inline-flex h-5 min-w-0 items-center gap-1 px-1 text-content/40">
          <GitBranch className="size-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate font-mono">{card.branch}</span>
        </span>
      ) : null}
    </div>
  );
}
