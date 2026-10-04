import type { SessionSummary } from "@/features/sessions/data/session-store";
import { replaceProjectHistory } from "@/features/sessions/data/session-history";
import { normalizeProjectPath } from "@/shared/lib/project-path";
import type { WorkspaceStore } from "../../store/types";

export type RefreshHistoryDeps = {
  list(cwd: string): Promise<SessionSummary[]>;
  /** Project the sidebar shows now; a late answer for another one is dropped. */
  sidebarCwd(): string;
};

/**
 * Lists a project's saved sessions into `history`. Every visited project's
 * rows stay in `history` and the sidebar filters by cwd, so a project loaded
 * once paints from cache and revalidates quietly. Whether the first load is
 * still pending is derived from `loadedProjects`, not tracked here — a status
 * set from this effect lands a render too late to suppress the empty state.
 */
export async function refreshProjectHistory(
  store: WorkspaceStore,
  cwd: string,
  deps: RefreshHistoryDeps,
): Promise<void> {
  if (!cwd || cwd === "~") return;

  const { setHistoryErrorCwd, setHistory, setLoadedProjects } =
    store.getState();
  const key = normalizeProjectPath(cwd);
  setHistoryErrorCwd((previous) => (previous === key ? null : previous));

  try {
    const rows = await deps.list(cwd);
    if (cwd !== deps.sidebarCwd()) return;

    setHistory((current) => replaceProjectHistory(current, cwd, rows));
    setLoadedProjects((previous) =>
      previous.has(key) ? previous : new Set(previous).add(key),
    );
  } catch {
    if (cwd !== deps.sidebarCwd()) return;
    // A failed revalidate keeps the cached cards rather than replacing a
    // good list with an error.
    if (!store.getState().loadedProjects.has(key)) setHistoryErrorCwd(key);
  }
}
