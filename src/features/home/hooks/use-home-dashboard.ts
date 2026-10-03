import { useEffect, useMemo, useState } from "react";
import { loadHomeDashboard } from "../model/home-data";
import type { HomeStatus } from "../model/home-status";
import type { RecentAutomationRow } from "../model/recent-automations";
import type { RecentSessionRow } from "../model/recent-sessions";

export type HomeDashboardState = {
  status: HomeStatus | null;
  sessions: RecentSessionRow[] | null;
  automations: RecentAutomationRow[] | null;
  error: string | null;
};

const EMPTY: HomeDashboardState = {
  status: null,
  sessions: null,
  automations: null,
  error: null,
};

export function useHomeDashboard(
  projectPaths: readonly string[],
): HomeDashboardState {
  const [state, setState] = useState<HomeDashboardState>(EMPTY);

  // Callers rebuild the path list on every render; reload only when it changes.
  const pathsKey = projectPaths.join("\0");
  const paths = useMemo(
    () => (pathsKey ? pathsKey.split("\0") : []),
    [pathsKey],
  );

  useEffect(() => {
    let alive = true;

    void loadHomeDashboard(paths)
      .then((data) => {
        if (!alive) return;
        setState({ ...data, error: null });
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setState((previous) => ({
          status: previous.status,
          sessions: [],
          automations: [],
          error:
            error instanceof Error ? error.message : "Home data unavailable",
        }));
      });

    return () => {
      alive = false;
    };
  }, [paths]);

  return state;
}
