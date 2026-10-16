import type { ReactNode } from "react";
import { HARNESS_LABEL } from "../../sessions/model/session";
import type { UsagePulseRow } from "../model/usagePulse";
import { HomeCard } from "./HomeCard";

type Props = {
  rows: readonly UsagePulseRow[];
  onOpenUsage?: () => void;
};

const ROW =
  "group flex w-full min-w-0 flex-col gap-1 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-accent/25 hover:bg-accent/[0.06] focus-visible:border-accent/40 focus-visible:outline-none";

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
      <ul className="flex h-full flex-col justify-center gap-1 overflow-y-auto">
        {rows.map((row) => (
          <li key={row.provider}>
            <button
              type="button"
              onClick={onOpenUsage}
              className={ROW}
              aria-label={`${HARNESS_LABEL[row.provider]} usage: ${row.windows
                .map((window) => `${window.label} ${window.usedPercent}%`)
                .join(", ")}`}
            >
              <span
                className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                  row.fetching ? "text-content/30" : "text-content/45"
                }`}
              >
                {HARNESS_LABEL[row.provider]}
              </span>
              {row.windows.map((window) => (
                <span
                  key={window.label}
                  className="flex items-center gap-2 font-mono text-[10px] tabular-nums text-content/55"
                >
                  <span className="w-6 shrink-0">{window.label}</span>
                  <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-content/10">
                    <span
                      className="block h-full rounded-full bg-accent/70"
                      style={{ width: `${window.usedPercent}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right">
                    {window.usedPercent}%
                  </span>
                </span>
              ))}
            </button>
          </li>
        ))}
      </ul>
    </HomeCard>
  );
}
