import type { ReactNode } from "react";
import { COLUMN_LABEL } from "../../constants/columns";
import { legalDropTargets, type DropTarget } from "../../model/transitions";
import type { Card } from "../../types/card";

type Props = { card: Card; onMove: (card: Card, target: DropTarget) => void };

/** Keyboard twin of drag-and-drop: the same legal targets, the same actions. */
export function MoveToMenu({ card, onMove }: Props): ReactNode {
  const targets = card.archived ? [] : legalDropTargets(card);
  if (targets.length === 0) return null;

  return (
    <select
      aria-label="Move card to"
      value=""
      onChange={(event) => {
        const target = targets.find((entry) => entry.column === event.target.value);
        if (target) onMove(card, target);
      }}
      className="h-7 shrink-0 cursor-pointer rounded-md border border-stroke bg-content/[0.03] px-1.5 text-[12px] text-content/70 outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
    >
      <option value="" disabled>
        Move to…
      </option>
      {targets.map((target) => (
        <option key={target.column} value={target.column}>
          {COLUMN_LABEL[target.column]}
        </option>
      ))}
    </select>
  );
}
