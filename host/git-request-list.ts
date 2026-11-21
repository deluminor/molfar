import type { GitPr } from "../src/domain/git/pull-request";

export function parseGlabList(text: string): GitPr | null {
  const rows = rowsOf(text);
  if (!rows) return null;
  let best: GitPr | null = null;
  for (const row of rows) {
    const number = row.iid;
    const title = row.title;
    const url = row.web_url;
    const state = row.state;
    if (
      typeof number !== "number" ||
      typeof title !== "string" ||
      typeof url !== "string" ||
      typeof state !== "string"
    ) {
      return null;
    }
    if (number <= 0) continue;
    const pr = { number, title, url, state: glabState(state) };
    if (pr.state === "open") return pr;
    best ??= pr;
  }
  return best;
}

export function parseGhList(text: string, owner: string): GitPr | null {
  const rows = rowsOf(text);
  if (!rows) return null;
  let best: GitPr | null = null;
  for (const row of rows) {
    const login = (row.headRepositoryOwner as { login?: string } | undefined)?.login;
    if (login && login.toLowerCase() !== owner.toLowerCase()) continue;
    const number = row.number;
    const title = row.title;
    const url = row.url;
    const state = row.state;
    if (
      typeof number !== "number" ||
      typeof title !== "string" ||
      typeof url !== "string" ||
      typeof state !== "string"
    ) {
      return null;
    }
    const pr = { number, title, url, state: state.toLowerCase() };
    if (pr.state === "open") return pr;
    best ??= pr;
  }
  return best;
}

function rowsOf(text: string): Record<string, unknown>[] | null {
  try {
    const rows = JSON.parse(text) as unknown;
    if (!Array.isArray(rows)) return null;
    if (rows.some((row) => !row || typeof row !== "object")) return null;
    return rows as Record<string, unknown>[];
  } catch {
    return null;
  }
}

function glabState(state: string): string {
  switch (state.toLowerCase()) {
    case "opened":
    case "open":
      return "open";
    case "merged":
      return "merged";
    case "closed":
    case "locked":
      return "closed";
    default:
      return state.toLowerCase();
  }
}
