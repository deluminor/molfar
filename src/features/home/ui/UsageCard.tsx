import type { ReactNode } from "react";
import type { UsagePulseRow } from "../model/usagePulse";
import { HomeCard } from "./HomeCard";

type Props = {
  rows: readonly UsagePulseRow[];
  onOpenUsage?: () => void;
};

function ProviderChip({
  row,
  onOpenUsage,
}: {
  row: UsagePulseRow;
  onOpenUsage?: () => void;
}): ReactNode {
  const detail =
    row.usedPercent != null ? `${row.usedPercent}%` : row.statusLabel;

  return (
    <button
      type="button"
      onClick={onOpenUsage}
      className="group flex min-w-0 flex-1 flex-col gap-1.5 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.06] focus-visible:border-accent/40 focus-visible:outline-none"
      aria-label={`${row.title} usage: ${detail}`}
    >
      <span
        className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
          row.fetching ? "text-content/30" : "text-content/45"
        }`}
      >
        {row.title}
      </span>
      {row.usedPercent != null ? (
        <>
          <span className="font-mono text-[16px] tabular-nums leading-none text-content">
            {row.usedPercent}%
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-content/10">
            <span
              className="block h-full rounded-full bg-accent/70"
              style={{ width: `${row.usedPercent}%` }}
            />
          </span>
        </>
      ) : (
        <span className="truncate font-mono text-[11px] text-content/50">
          {row.statusLabel}
        </span>
      )}
    </button>
  );
}

export function UsageCard({ rows, onOpenUsage }: Props): ReactNode {
  if (rows.length === 0) {
    return (
      <HomeCard title="Usage">
        <p className="font-mono text-[12px] text-content/45">
          No provider usage yet
        </p>
      </HomeCard>
    );
  }

  return (
    <HomeCard title="Usage">
      <div className="flex h-full min-h-0 items-stretch gap-1 overflow-x-auto">
        {rows.map((row) => (
          <ProviderChip key={row.provider} row={row} onOpenUsage={onOpenUsage} />
        ))}
      </div>
    </HomeCard>
  );
}
