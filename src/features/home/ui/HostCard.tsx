import type { ReactNode } from "react";
import {
  formatLoad,
  formatPercent,
  formatProcessCount,
  loadAsPercent,
  type HostStats,
} from "../model/host-stats";
import {
  processSeriesAsPercent,
  sparklineGeometry,
  type HostSamplePoint,
} from "../model/host-history";
import { HomeCard } from "./HomeCard";

type Props = {
  stats: HostStats | null;
  history: readonly HostSamplePoint[];
  error: string | null;
};

const CHART_W = 200;
const CHART_H = 36;

function MetricChart({
  label,
  value,
  series,
  display,
}: {
  label: string;
  value: number;
  series: readonly number[];
  display?: string;
}): ReactNode {
  const geo = sparklineGeometry(series, CHART_W, CHART_H);
  const gradientId = `host-fill-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
        <span className="text-content/45">{label}</span>
        <span className="text-accent tabular-nums">
          {display ?? formatPercent(value)}
        </span>
      </div>
      <svg
        role="img"
        aria-label={`${label} ${display ?? formatPercent(value)}`}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="h-9 w-full text-accent"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {geo.area ? <path d={geo.area} fill={`url(#${gradientId})`} /> : null}
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

export function HostCard({ stats, history, error }: Props): ReactNode {
  if (error) {
    return (
      <HomeCard title="Host">
        <p className="font-mono text-[12px] text-content/45">{error}</p>
      </HomeCard>
    );
  }
  if (!stats) {
    return (
      <HomeCard title="Host">
        <p className="font-mono text-[12px] text-content/40">Loading…</p>
      </HomeCard>
    );
  }
  const loadPct = loadAsPercent(stats.loadAverage, stats.cpuCount);
  const cpuSeries = history.map((point) => point.cpuPercent);
  const ramSeries = history.map((point) => point.memoryPercent);
  const swapSeries = history.map((point) => point.swapPercent);
  const loadSeries = history.map((point) => point.loadPercent);
  const procSeries = processSeriesAsPercent(
    history.map((point) => point.processCount),
  );

  return (
    <HomeCard title="Host">
      <div className="flex h-full flex-col justify-center gap-2.5">
        <div className="grid min-h-0 grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <MetricChart
            label="CPU"
            value={stats.cpuPercent}
            series={cpuSeries}
          />
          <MetricChart
            label="RAM"
            value={stats.memoryPercent}
            series={ramSeries}
          />
          <MetricChart
            label="SWAP"
            value={stats.swapPercent}
            series={swapSeries}
          />
          <MetricChart
            label="LOAD"
            value={loadPct}
            series={loadSeries}
            display={formatLoad(stats.loadAverage)}
          />
          <MetricChart
            label="PROC"
            value={
              procSeries.length > 0 ? procSeries[procSeries.length - 1] : 0
            }
            series={procSeries}
            display={formatProcessCount(stats.processCount)}
          />
          <div className="flex flex-col justify-end pb-1 font-mono text-[10px] uppercase tracking-wider text-content/35">
            <span>{stats.cpuCount} logical cores</span>
          </div>
        </div>
      </div>
    </HomeCard>
  );
}
