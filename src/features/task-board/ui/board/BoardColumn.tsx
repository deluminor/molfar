import type { DragEvent, ReactNode } from "react";
import { COLUMN_LABEL, isAgentStage } from "../../constants/columns";
import type { BoardColumn as ColumnId, Card } from "../../types/card";
import type { StageModelConfig } from "../../types/stage";
import { ColumnModelChip } from "./ColumnModelChip";

type Props = {
  column: ColumnId;
  cards: readonly Card[];
  /** null while nothing is dragged; true/false whether the drag may land here. */
  dropAllowed: boolean | null;
  modelConfig: StageModelConfig | undefined;
  onModelChange: (config: StageModelConfig | undefined) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  renderCard: (card: Card) => ReactNode;
};

const EMPTY_HINT: Partial<Record<ColumnId, string>> = {
  backlog: "New tasks land here.",
  plan_approval: "Plans wait here for your approval.",
  final_review: "Reviewed work waits here for you.",
};

function dropToneClass(dropAllowed: boolean | null): string {
  if (dropAllowed === null) return "border-transparent";
  if (dropAllowed) return "border-accent/50 bg-accent/[0.04]";
  return "border-transparent opacity-40";
}

export function BoardColumn({
  column,
  cards,
  dropAllowed,
  modelConfig,
  onModelChange,
  onDragOver,
  onDrop,
  renderCard,
}: Props): ReactNode {
  const label = COLUMN_LABEL[column];
  const dropTone = dropToneClass(dropAllowed);

  return (
    <section
      aria-label={`${label}, ${cards.length} card${cards.length === 1 ? "" : "s"}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex h-full w-[272px] shrink-0 flex-col rounded-2xl border-2 border-dashed transition-[border-color,background-color,opacity] duration-150 motion-reduce:transition-none ${dropTone}`}
    >
      <header className="flex shrink-0 flex-col gap-0.5 px-2 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[12px] font-medium text-content/80">{label}</h2>
          <span className="text-[11px] tabular-nums text-content/35">{cards.length}</span>
        </div>
        {isAgentStage(column) ? (
          <ColumnModelChip label={label} config={modelConfig} onChange={onModelChange} />
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-2">
        {cards.map((card) => renderCard(card))}
        {cards.length === 0 ? (
          <p className="mx-1 rounded-xl border border-dashed border-stroke px-3 py-4 text-center text-[12px] text-content/35">
            {EMPTY_HINT[column] ?? "Nothing here."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
