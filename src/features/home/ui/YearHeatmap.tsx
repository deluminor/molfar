import type { ReactNode } from "react";
import type { ActivityCell, ActivityYearGrid } from "../model/sessionActivity";

type Variant = "compact" | "full";

type Props = {
  grid: ActivityYearGrid;
  variant?: Variant;
};

const LEVEL_CLASS: Record<ActivityCell["level"], string> = {
  0: "bg-content/[0.06]",
  1: "bg-accent/25",
  2: "bg-accent/45",
  3: "bg-accent/70",
  4: "bg-accent",
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function cellTitle(cell: ActivityCell): string {
  if (!cell.inYear) return "";
  if (cell.future) return `${cell.dateKey} · upcoming`;
  if (cell.count === 0) return `${cell.dateKey} · no sessions`;
  return `${cell.dateKey} · ${cell.count} session${cell.count === 1 ? "" : "s"}`;
}

function monthMarkers(grid: ActivityYearGrid): { week: number; label: string }[] {
  const markers: { week: number; label: string }[] = [];
  let lastMonth = -1;
  grid.weeks.forEach((week, weekIndex) => {
    const anchor = week.find((cell) => cell.inYear && cell.day === 1);
    if (!anchor || anchor.month === lastMonth) return;
    lastMonth = anchor.month;
    markers.push({ week: weekIndex, label: MONTH_SHORT[anchor.month]! });
  });
  return markers;
}

/** GitHub-style year contribution grid; compact for Home, full for Usage. */
export function YearHeatmap({ grid, variant = "compact" }: Props): ReactNode {
  const gap = variant === "compact" ? "gap-px" : "gap-[3px]";
  const cell =
    variant === "compact"
      ? "size-1.5 rounded-[1px]"
      : "size-[11px] rounded-[2px]";
  const markers = variant === "full" ? monthMarkers(grid) : [];

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-col ${variant === "full" ? "gap-2" : "gap-1"}`}
      role="img"
      aria-label={`${grid.year} session activity: ${grid.totalActiveDays} active days, ${grid.totalSessions} sessions`}
    >
      {variant === "full" ? (
        <div className={`flex ${gap} font-mono text-[10px] text-content/40`}>
          {grid.weeks.map((_, weekIndex) => {
            const marker = markers.find((item) => item.week === weekIndex);
            return (
              <span
                key={weekIndex}
                className="w-[11px] shrink-0 overflow-visible whitespace-nowrap"
              >
                {marker?.label ?? ""}
              </span>
            );
          })}
        </div>
      ) : null}
      <div className={`flex min-w-0 overflow-x-auto ${gap}`}>
        {grid.weeks.map((week, weekIndex) => (
          <div key={weekIndex} className={`flex shrink-0 flex-col ${gap}`}>
            {week.map((day) => (
              <span
                key={`${day.dateKey}-${day.inYear ? "y" : "p"}`}
                title={cellTitle(day)}
                className={`${cell} ${
                  day.inYear
                    ? day.future
                      ? "bg-content/[0.03]"
                      : LEVEL_CLASS[day.level]
                    : "bg-transparent"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
      {variant === "full" ? (
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] text-content/40">
          <span>
            {grid.totalActiveDays} days · {grid.totalSessions} sessions ·{" "}
            {grid.year}
          </span>
          <span className="flex items-center gap-1">
            Less
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <span
                key={level}
                className={`size-[9px] rounded-[2px] ${LEVEL_CLASS[level]}`}
              />
            ))}
            More
          </span>
        </div>
      ) : (
        <p className="truncate font-mono text-[10px] text-content/40">
          {grid.totalActiveDays}d · {grid.totalSessions} · {grid.year}
        </p>
      )}
    </div>
  );
}
