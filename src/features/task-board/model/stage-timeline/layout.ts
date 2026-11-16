import type { StageRun } from "../../types/stage";
import type { TimelineLayout, TimelineRow } from "./types";
import { MINIMUM_DOMAIN_MS } from "./constants";

export function layoutTimeline(
  runs: readonly StageRun[],
  now: number,
): TimelineLayout {
  const rows: TimelineRow[] = runs.map((run) => {
    const endpoint = run.completedAt ?? now;
    const end = Math.max(run.startedAt, endpoint);
    const valid =
      Number.isFinite(run.startedAt) &&
      Number.isFinite(endpoint) &&
      Number.isFinite(end - run.startedAt);

    return {
      run,
      completionUnavailable:
        run.completedAt === null && run.status !== "running",
      interval: valid
        ? {
            start: run.startedAt,
            end,
            duration: end - run.startedAt,
            left: 0,
            width: 0,
          }
        : null,
    };
  });
  rows.sort((a, b) => {
    if (!a.interval) return b.interval ? 1 : 0;
    if (!b.interval) return -1;
    return a.interval.start - b.interval.start;
  });

  let origin = Infinity;
  let extent = -Infinity;
  for (const row of rows) {
    if (!row.interval) continue;
    origin = Math.min(origin, row.interval.start);
    extent = Math.max(extent, row.interval.end);
  }

  if (!Number.isFinite(origin))
    return { origin: null, extent: null, totalElapsed: null, rows };

  const span = extent - origin;
  const totalElapsed = Math.min(Number.MAX_VALUE, span);
  const scale = Number.isFinite(span) ? 1 : 2;
  const domain = Math.max(
    MINIMUM_DOMAIN_MS / scale,
    extent / scale - origin / scale,
  );
  for (const row of rows) {
    if (!row.interval) continue;
    row.interval.left =
      ((row.interval.start / scale - origin / scale) / domain) * 100;
    row.interval.width = (row.interval.duration / scale / domain) * 100;
  }

  return { origin, extent, totalElapsed, rows };
}
