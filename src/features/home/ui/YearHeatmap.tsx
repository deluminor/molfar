import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  computeHeatmapCellLayout,
  type HeatmapCellLayout,
  type HeatmapVariant,
} from "../model/heatmapLayout";
import type { ActivityCell, ActivityYearGrid } from "../model/sessionActivity";

type Props = {
  grid: ActivityYearGrid;
  variant?: HeatmapVariant;
  className?: string;
};

/** Empty stays cool/neutral; active rungs step clearly into MOLFAR accent. */
const LEVEL_CLASS: Record<ActivityCell["level"], string> = {
  0: "bg-content/[0.09] ring-1 ring-inset ring-content/[0.06]",
  1: "bg-accent/30",
  2: "bg-accent/50",
  3: "bg-accent/75",
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

const FALLBACK_LAYOUT: HeatmapCellLayout = {
  cellPx: 6,
  gapXPx: 2,
  gapYPx: 2,
  showMonthLabels: false,
  showLegend: false,
};

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

function cellBoxStyle(layout: HeatmapCellLayout): CSSProperties {
  const radius = Math.max(2, Math.round(layout.cellPx * 0.28));
  return {
    width: layout.cellPx,
    height: layout.cellPx,
    borderRadius: radius,
  };
}

/** GitHub-style year contribution grid; sizes itself to the container. */
export function YearHeatmap({
  grid,
  variant = "compact",
  className = "",
}: Props): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<HeatmapCellLayout>(() => ({
    ...FALLBACK_LAYOUT,
    showLegend: variant === "full",
    showMonthLabels: variant === "full",
  }));

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const measure = (): void => {
      const next = computeHeatmapCellLayout({
        widthPx: el.clientWidth,
        heightPx: el.clientHeight,
        weekCount: grid.weeks.length,
        variant,
      });
      setLayout((prev) =>
        prev.cellPx === next.cellPx &&
        prev.gapXPx === next.gapXPx &&
        prev.gapYPx === next.gapYPx &&
        prev.showMonthLabels === next.showMonthLabels &&
        prev.showLegend === next.showLegend
          ? prev
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [grid.weeks.length, variant]);

  const markers = layout.showMonthLabels ? monthMarkers(grid) : [];
  const cellStyle = cellBoxStyle(layout);
  const weekGapStyle: CSSProperties = { gap: layout.gapYPx };
  const rowGapStyle: CSSProperties = { gap: layout.gapXPx };
  const legendSwatch = Math.max(8, layout.cellPx - 1);
  const isFull = variant === "full";

  return (
    <div
      ref={rootRef}
      className={`flex w-full min-w-0 flex-col ${
        isFull
          ? "min-h-[11.5rem] justify-start"
          : "h-full min-h-0 justify-center"
      } ${className}`}
      role="img"
      aria-label={`${grid.year} session activity: ${grid.totalActiveDays} active days, ${grid.totalSessions} sessions`}
    >
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 ${
          isFull
            ? "w-full items-stretch justify-start"
            : "items-center justify-center"
        }`}
      >
        {layout.showMonthLabels ? (
          <div
            className="flex w-full font-mono text-[10px] tracking-wide text-content/45"
            style={rowGapStyle}
          >
            {grid.weeks.map((_, weekIndex) => {
              const marker = markers.find((item) => item.week === weekIndex);
              return (
                <span
                  key={weekIndex}
                  className="shrink-0 overflow-visible whitespace-nowrap"
                  style={{ width: layout.cellPx }}
                >
                  {marker?.label ?? ""}
                </span>
              );
            })}
          </div>
        ) : null}

        <div className={`flex min-w-0 ${isFull ? "w-full" : ""}`} style={rowGapStyle}>
          {grid.weeks.map((week, weekIndex) => (
            <div
              key={weekIndex}
              className="flex shrink-0 flex-col"
              style={weekGapStyle}
            >
              {week.map((day) => (
                <span
                  key={`${day.dateKey}-${day.inYear ? "y" : "p"}`}
                  title={cellTitle(day)}
                  style={cellStyle}
                  className={
                    day.inYear
                      ? day.future
                        ? "bg-content/[0.04] ring-1 ring-inset ring-content/[0.04]"
                        : LEVEL_CLASS[day.level]
                      : "bg-transparent"
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {layout.showLegend ? (
        <div className="mt-1.5 flex shrink-0 items-center justify-between gap-3 font-mono text-[10px] text-content/45">
          <span className="tracking-wide">
            {grid.totalActiveDays} days · {grid.totalSessions} sessions ·{" "}
            {grid.year}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-content/35">Less</span>
            {([0, 1, 2, 3, 4] as const).map((level) => (
              <span
                key={level}
                className={LEVEL_CLASS[level]}
                style={{
                  width: legendSwatch,
                  height: legendSwatch,
                  borderRadius: Math.max(2, Math.round(legendSwatch * 0.28)),
                }}
              />
            ))}
            <span className="text-content/35">More</span>
          </span>
        </div>
      ) : (
        <p className="mt-1 shrink-0 truncate text-center font-mono text-[10px] tracking-wide text-content/40">
          {grid.totalActiveDays}d · {grid.totalSessions} · {grid.year}
        </p>
      )}
    </div>
  );
}
