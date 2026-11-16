import type { ReactNode } from "react";
import { UsageProvidersSkeleton } from "@/features/usage/ui/UsageProvidersSkeleton";
import type { UsagePulseRow } from "../model/usage-pulse";
import { HomeCard } from "./HomeCard";

type Props = {
  rows: readonly UsagePulseRow[];
  pending?: boolean;
  onOpenUsage?: () => void;
};

function ProviderTile({
  row,
  onOpenUsage,
}: {
  row: UsagePulseRow;
  onOpenUsage?: () => void;
}): ReactNode {
  const detail =
    row.usedPercent != null ? `${row.usedPercent}%` : row.statusLabel;
  let meta: string | null = null;
  if (row.resetLabel != null) meta = `resets ${row.resetLabel}`;
  else if (row.usedPercent != null) meta = row.statusLabel;

  return (
    <button
      type="button"
      onClick={onOpenUsage}
      className="group flex min-h-0 min-w-0 flex-col justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.06] focus-visible:border-accent/40 focus-visible:outline-none"
      aria-label={
        row.resetLabel != null
          ? `${row.title} usage: ${detail}, resets ${row.resetLabel}`
          : `${row.title} usage: ${detail}`
      }
    >
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span
          className={`truncate font-mono text-[10px] uppercase tracking-[0.16em] ${
            row.fetching ? "text-content/30" : "text-content/45"
          }`}
        >
          {row.title}
        </span>
        {row.usedPercent != null ? (
          <span className="shrink-0 font-mono text-[15px] tabular-nums leading-none text-content">
            {row.usedPercent}%
          </span>
        ) : null}
      </div>

      {row.usedPercent != null ? (
        <span className="h-1 w-full overflow-hidden rounded-full bg-content/10">
          <span
            className="block h-full rounded-full bg-accent/70"
            style={{ width: `${row.usedPercent}%` }}
          />
        </span>
      ) : (
        <span className="truncate font-mono text-[11px] text-content/50">
          {row.statusLabel}
        </span>
      )}

      {meta != null ? (
        <span className="truncate font-mono text-[10px] text-content/35">
          {meta}
        </span>
      ) : null}
    </button>
  );
}

export function UsageCard({
  rows,
  pending = false,
  onOpenUsage,
}: Props): ReactNode {
  if (pending) {
    return (
      <HomeCard title="Usage">
        <UsageProvidersSkeleton compact count={2} />
      </HomeCard>
    );
  }

  if (rows.length === 0) {
    return (
      <HomeCard title="Usage">
        <p className="font-mono text-[12px] text-content/45">
          No provider usage yet
        </p>
      </HomeCard>
    );
  }

  const tileClass =
    rows.length === 1
      ? "grid h-full min-h-0 grid-cols-1 content-stretch gap-1"
      : "grid h-full min-h-0 grid-cols-2 auto-rows-fr content-stretch gap-1";

  return (
    <HomeCard title="Usage">
      <div className={tileClass}>
        {rows.map((row) => (
          <ProviderTile key={row.provider} row={row} onOpenUsage={onOpenUsage} />
        ))}
      </div>
    </HomeCard>
  );
}
