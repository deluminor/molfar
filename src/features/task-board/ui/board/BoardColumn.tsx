import type { ReactNode } from "react";
import { COLUMN_LABEL, isAgentStage } from "../../constants/columns";
import { COLUMN_LOOK, KIND_TONE } from "../../constants/column-look";
import type { BoardColumn as ColumnId, Card } from "../../types/card";
import type { StageModelConfig } from "../../types/stage";
import { ColumnModelChip } from "./ColumnModelChip";
import { ColumnNote } from "./ColumnNote";

type Props = {
  column: ColumnId;
  cards: readonly Card[];
  /** null while nothing is dragged; otherwise the label of the drop here, or false. */
  drop: string | false | null;
  /** The pointer is over this column right now. */
  over: boolean;
  modelConfig: StageModelConfig | undefined;
  columnSkills: readonly string[] | undefined;
  modelProject: string | undefined;
  onModelChange: (config: StageModelConfig | undefined) => void;
  onSkillsChange: (skills: string[] | undefined) => void;
  renderCard: (card: Card) => ReactNode;
};

const EMPTY_HINT: Partial<Record<ColumnId, string>> = {
  backlog: "New tasks land here",
  grill: "Specs and plans get drafted here",
  plan_approval: "Plans wait here for you",
  implement: "Approved plans get built here",
  code_review: "Finished work gets reviewed here",
  final_review: "Reviewed work waits here for you",
  rework: "Picked findings get fixed here",
  done: "Delivered cards rest here",
};

function frameClass(drop: string | false | null, over: boolean): string {
  if (drop === null) return "border-stroke bg-content/[0.025]";
  if (drop && over) return "border-accent bg-accent/[0.1] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_28%,transparent)]";
  if (drop) return "border-accent/55 bg-accent/[0.05] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_14%,transparent)]";
  return "border-stroke bg-content/[0.015] opacity-45";
}

export function BoardColumn({
  column,
  cards,
  drop,
  over,
  modelConfig,
  columnSkills,
  modelProject,
  onModelChange,
  onSkillsChange,
  renderCard,
}: Props): ReactNode {
  const label = COLUMN_LABEL[column];
  const { icon: Icon, kind } = COLUMN_LOOK[column];

  return (
    <section
      aria-label={`${label}, ${cards.length} card${cards.length === 1 ? "" : "s"}`}
      data-board-column={column}
      className={`relative flex h-full w-[288px] shrink-0 flex-col rounded-2xl border transition-[border-color,background-color,opacity,box-shadow] duration-200 motion-reduce:transition-none ${frameClass(drop, over)}`}
    >
      <header className="flex shrink-0 flex-col gap-2 px-3 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <span className={`grid size-6 shrink-0 place-items-center rounded-md ${KIND_TONE[kind]}`}>
            <Icon className="size-3.5" strokeWidth={1.9} />
          </span>
          <h2 className="min-w-0 truncate text-[13px] font-medium text-content/90">{label}</h2>
          <span className="min-w-5 rounded-md bg-content/[0.07] px-1.5 text-center text-[11px] font-medium leading-5 tabular-nums text-content/55">
            {cards.length}
          </span>
        </div>
        {isAgentStage(column) ? (
          <ColumnModelChip
            label={label}
            stage={column}
            config={modelConfig}
            skills={columnSkills}
            project={modelProject}
            onChange={onModelChange}
            onSkillsChange={onSkillsChange}
          />
        ) : (
          <ColumnNote column={column} />
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 [scrollbar-gutter:stable]">
        {cards.map((card) => renderCard(card))}
        {cards.length === 0 && !drop ? (
          <div className="mx-1 mt-1 flex flex-col items-center gap-2 rounded-xl px-3 py-6 text-center">
            <Icon className="size-5 text-content/15" strokeWidth={1.5} />
            <p className="text-[12px] leading-4 text-content/35">{EMPTY_HINT[column]}</p>
          </div>
        ) : null}
        {drop ? (
          <div className="mx-1 flex items-center justify-center rounded-xl border border-dashed border-accent/50 px-3 py-4 text-[12px] font-medium text-accent">
            {drop}
          </div>
        ) : null}
      </div>
    </section>
  );
}
