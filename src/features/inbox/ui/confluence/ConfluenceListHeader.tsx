import type { ReactNode } from "react";
import { RefreshCw, Search } from "../../../../shared/ui/icons";
import type { ConfluenceSpace } from "../../model/confluence/types";

type Props = {
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  visibleSpaces: readonly ConfluenceSpace[];
  activeSpaceId: string | undefined;
  onSpaceChange: (id: string) => void;
};

export function ConfluenceListHeader({
  searchInput,
  onSearchInputChange,
  refreshing,
  onRefresh,
  visibleSpaces,
  activeSpaceId,
  onSpaceChange,
}: Props): ReactNode {
  return (
    <>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-stroke px-2">
        <div className="relative flex h-7 min-w-0 flex-1 items-center">
          <Search className="pointer-events-none absolute left-2 size-3 shrink-0 opacity-50" />
          <input
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder="Search Confluence"
            aria-label="Search Confluence"
            spellCheck={false}
            autoComplete="off"
            className="h-7 w-full rounded-md bg-transparent pl-7 pr-2 text-[12px] text-content outline-none placeholder:text-content/40"
          />
        </div>
        <button
          type="button"
          title="Refresh Confluence"
          aria-label="Refresh Confluence"
          disabled={refreshing}
          onClick={onRefresh}
          className="grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content disabled:opacity-40"
        >
          <RefreshCw
            className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
            strokeWidth={1.75}
          />
        </button>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-stroke px-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-content/50">
          <span className="shrink-0">Space</span>
          <select
            aria-label="Confluence space"
            value={activeSpaceId ?? ""}
            onChange={(event) => onSpaceChange(event.target.value)}
            className="h-7 min-w-0 flex-1 rounded-md border border-content/10 bg-transparent px-2 text-[12px] text-content outline-none"
          >
            {visibleSpaces.length === 0 ? (
              <option value="">No spaces</option>
            ) : (
              visibleSpaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name} ({space.key})
                </option>
              ))
            )}
          </select>
        </label>
      </div>
    </>
  );
}
