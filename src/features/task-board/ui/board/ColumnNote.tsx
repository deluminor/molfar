import type { ReactNode } from "react";
import { COLUMN_LOOK, COLUMN_NOTE, NOTE_TONE } from "../../constants/column-look";
import type { BoardColumn } from "../../types/card";

/** Who acts in a column with no agent, in the slot a model chip takes elsewhere. */
export function ColumnNote({ column }: { column: BoardColumn }): ReactNode {
  const note = COLUMN_NOTE[column];
  if (!note) return null;
  const { icon: Icon } = note;

  return (
    <div
      className={`flex h-7 w-full min-w-0 items-center gap-1.5 rounded-lg border border-dashed px-2 text-[11.5px] ${NOTE_TONE[COLUMN_LOOK[column].kind]}`}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.9} />
      <span className="min-w-0 truncate">
        <span className="font-medium">{note.lead}</span>
        <span className="opacity-70"> · {note.rest}</span>
      </span>
    </div>
  );
}
