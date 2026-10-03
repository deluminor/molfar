import { useState, type ReactNode } from "react";
import type { ConfluenceSpace } from "../../model/confluence/types";

type Props = {
  spaces: readonly ConfluenceSpace[];
  hiddenIds: readonly string[];
  onChange: (ids: string[]) => void;
};

function hiddenSummary(count: number): string {
  if (count === 0) return "Manage visible spaces";

  return `${count} space${count === 1 ? "" : "s"} hidden · manage`;
}

export function SpaceVisibility({
  spaces,
  hiddenIds,
  onChange,
}: Props): ReactNode {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-b border-stroke px-3 py-1.5 text-left text-[11px] text-content/40 hover:text-content/70"
      >
        {hiddenSummary(hiddenIds.length)}
      </button>
    );
  }

  const hidden = new Set(hiddenIds);

  return (
    <div className="max-h-36 overflow-y-auto border-b border-stroke px-2 py-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[11px] text-content/45">Visible spaces</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-content/45 hover:text-content"
        >
          Done
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {spaces.map((space) => {
          const checked = !hidden.has(space.id);
          return (
            <li key={space.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:bg-content/5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(hidden);
                    if (checked) next.add(space.id);
                    else next.delete(space.id);
                    onChange([...next]);
                  }}
                />
                <span className="min-w-0 truncate text-content/80">
                  {space.name}
                </span>
                <span className="shrink-0 text-content/35">{space.key}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
