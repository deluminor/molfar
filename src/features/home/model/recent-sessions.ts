import {
  listSessionsByProject,
  type SessionSummary,
} from "../../sessions/data/session-store";

export type RecentSessionRow = {
  id: string;
  title: string;
  cwd: string;
  harness: string;
  updatedAt: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Latest sessions across recent projects, newest first, capped at `limit`.
 * Each project is fetched independently so one slow/failing cwd does not
 * block the rest.
 */
export async function loadRecentSessions(
  projectPaths: readonly string[],
  limit = 3,
): Promise<RecentSessionRow[]> {
  const rows = await scanProjectSessions(projectPaths);
  return pickRecentSessions(rows, limit);
}

/** Sessions updated within the last 24 hours, for the Status card. */
export function countSessionsUpdatedWithin(
  rows: readonly SessionSummary[],
  now: number,
  windowMs = DAY_MS,
): number {
  const cutoff = now - windowMs;
  return rows.filter((row) => !row.archived && row.updatedAt >= cutoff).length;
}

export async function scanProjectSessions(
  projectPaths: readonly string[],
): Promise<SessionSummary[]> {
  if (projectPaths.length === 0) return [];
  const settled = await Promise.allSettled(
    projectPaths.map((cwd) => listSessionsByProject(cwd)),
  );
  const rows: SessionSummary[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") rows.push(...result.value);
  }
  return rows;
}

/** Pure sorter used by the loader and by unit tests. */
export function pickRecentSessions(
  rows: readonly SessionSummary[],
  limit: number,
): RecentSessionRow[] {
  return [...rows]
    .filter((row) => !row.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit))
    .map((row) => ({
      id: row.id,
      title: row.title.trim() || "Untitled",
      cwd: row.cwd,
      harness: row.harness,
      updatedAt: row.updatedAt,
    }));
}
