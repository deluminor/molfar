/** Session activity year heatmap — local calendar days with any session update. */

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export type ActivityCell = {
  dateKey: string;
  year: number;
  month: number;
  day: number;
  weekday: number;
  count: number;
  level: ActivityLevel;
  /** False for padding cells outside the target calendar year. */
  inYear: boolean;
  /** True for calendar days after `now` within the year. */
  future: boolean;
};

export type ActivityYearGrid = {
  year: number;
  weeks: readonly (readonly ActivityCell[])[];
  totalActiveDays: number;
  totalSessions: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local `YYYY-MM-DD` for a unix-ms timestamp. */
export function localDateKey(ms: number): string {
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Absolute intensity bands — honest session counts, not fake percentages. */
export function activityLevel(count: number): ActivityLevel {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/**
 * Count non-archived sessions whose `updatedAt` falls on each local day.
 * Only days in `year` are kept.
 */
export function countSessionsByDay(
  timestamps: readonly number[],
  year: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of timestamps) {
    if (!Number.isFinite(raw)) continue;
    const date = new Date(raw);
    if (date.getFullYear() !== year) continue;
    const key = localDateKey(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Build a Sunday-start week grid for the calendar year.
 * Padding cells before Jan 1 / after Dec 31 keep week columns aligned.
 */
export function buildActivityYear(
  timestamps: readonly number[],
  year: number,
  now = Date.now(),
): ActivityYearGrid {
  const counts = countSessionsByDay(timestamps, year);
  const todayStart = startOfLocalDay(now);
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const gridStart = new Date(jan1);
  gridStart.setDate(jan1.getDate() - jan1.getDay());
  const gridEnd = new Date(dec31);
  gridEnd.setDate(dec31.getDate() + (6 - dec31.getDay()));

  const weeks: ActivityCell[][] = [];
  let totalActiveDays = 0;
  let totalSessions = 0;
  let cursor = startOfLocalDay(gridStart.getTime());
  const end = startOfLocalDay(gridEnd.getTime());

  while (cursor <= end) {
    const week: ActivityCell[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(cursor + weekday * DAY_MS);
      const cellYear = date.getFullYear();
      const inYear = cellYear === year;
      const dateKey = localDateKey(date.getTime());
      const rawCount = inYear ? (counts.get(dateKey) ?? 0) : 0;
      const future = inYear && startOfLocalDay(date.getTime()) > todayStart;
      const count = future ? 0 : rawCount;
      if (inYear && !future && count > 0) {
        totalActiveDays += 1;
        totalSessions += count;
      }
      week.push({
        dateKey,
        year: cellYear,
        month: date.getMonth(),
        day: date.getDate(),
        weekday,
        count,
        level: activityLevel(count),
        inYear,
        future,
      });
    }
    weeks.push(week);
    cursor += 7 * DAY_MS;
  }

  return { year, weeks, totalActiveDays, totalSessions };
}
