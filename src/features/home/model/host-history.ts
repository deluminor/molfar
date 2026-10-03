import { clampPercent, loadAsPercent, type HostStats } from "./host-stats";

export { clampPercent } from "./host-stats";

export const HOST_HISTORY_LIMIT = 60;

export type HostSamplePoint = {
  cpuPercent: number;
  memoryPercent: number;
  swapPercent: number;
  loadPercent: number;
  processCount: number;
  at: number;
};

/**
 * Append a host poll sample and trim to `limit` (oldest dropped first).
 * Pure so HomeView state updates stay trivial to test.
 */
export function pushHostSample(
  history: readonly HostSamplePoint[],
  sample: HostStats,
  at = Date.now(),
  limit = HOST_HISTORY_LIMIT,
): HostSamplePoint[] {
  const point: HostSamplePoint = {
    cpuPercent: clampPercent(sample.cpuPercent),
    memoryPercent: clampPercent(sample.memoryPercent),
    swapPercent: clampPercent(sample.swapPercent),
    loadPercent: loadAsPercent(sample.loadAverage, sample.cpuCount),
    processCount: Math.max(0, Math.round(sample.processCount)),
    at,
  };
  const next = [...history, point];
  const max = Math.max(1, limit);
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * Map process counts into a 0–100 sparkline relative to the max in the window
 * (and a soft floor so a flat line does not sit on zero).
 */
export function processSeriesAsPercent(counts: readonly number[]): number[] {
  if (counts.length === 0) return [];
  const peak = Math.max(...counts, 1);
  return counts.map((count) => clampPercent((count / peak) * 100));
}

export type SparklineGeometry = {
  /** Open polyline through the samples. */
  line: string;
  /** Closed path for a filled area under the line. */
  area: string;
};

/**
 * Build SVG path strings for a 0–100 series. A single sample yields a flat mid-height stroke.
 */
export function sparklineGeometry(
  values: readonly number[],
  width: number,
  height: number,
): SparklineGeometry {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  if (values.length === 0) {
    return { line: "", area: "" };
  }
  const points = values.map((raw, index) => {
    const x = values.length === 1 ? w / 2 : (index / (values.length - 1)) * w;
    const y = h - (clampPercent(raw) / 100) * h;
    return { x, y };
  });
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L${last.x.toFixed(2)} ${h} L${first.x.toFixed(2)} ${h} Z`;
  return { line, area };
}
