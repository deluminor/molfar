import type { ReactNode } from "react";
import type { UsageTrendPoint } from "../model/usage-snapshots";

type Props = {
  points: readonly UsageTrendPoint[];
};

const CHART_W = 320;
const CHART_H = 48;

function trendPaths(values: readonly number[]): { line: string; area: string } {
  if (values.length === 0) return { line: "", area: "" };
  const points = values.map((raw, index) => {
    const x = values.length === 1 ? CHART_W / 2 : (index / (values.length - 1)) * CHART_W;
    const y = CHART_H - (Math.max(0, Math.min(100, raw)) / 100) * CHART_H;
    return { x, y };
  });
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return {
    line,
    area: `${line} L${last.x.toFixed(2)} ${CHART_H} L${first.x.toFixed(2)} ${CHART_H} Z`,
  };
}

/** Honest sparkline — only days with real snapshot readings plot. */
export function UsageTrendChart({ points }: Props): ReactNode {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value != null);

  if (values.length === 0) {
    return (
      <p className="font-mono text-[12px] text-content/40">
        Trend grows as daily usage snapshots accumulate.
      </p>
    );
  }

  const geo = trendPaths(values);
  const latest = values[values.length - 1]!;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
        <span className="text-content/45">Usage trend</span>
        <span className="tabular-nums text-accent">
          {latest}% · {values.length} day{values.length === 1 ? "" : "s"}
        </span>
      </div>
      <svg
        role="img"
        aria-label={`Usage trend, latest ${latest} percent over ${values.length} days`}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-12 w-full text-accent"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="usage-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {geo.area ? <path d={geo.area} fill="url(#usage-trend-fill)" /> : null}
        {geo.line ? (
          <path
            d={geo.line}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
    </div>
  );
}
