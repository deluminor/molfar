import { useEffect, useMemo, useState } from "react";
import { scanProjectSessions } from "../model/recentSessions";
import {
  buildActivityYear,
  type ActivityYearGrid,
} from "../model/sessionActivity";

export type SessionActivityState =
  | { status: "loading" }
  | { status: "ready"; grid: ActivityYearGrid }
  | { status: "error"; message: string };

/**
 * Year heatmap of session updates across every project path.
 * Hidden widgets skip the scan until shown again.
 */
export function useSessionActivity(
  projectPaths: readonly string[],
  enabled = true,
): SessionActivityState {
  const [state, setState] = useState<SessionActivityState>({ status: "loading" });
  const pathsKey = projectPaths.join("\0");
  const paths = useMemo(
    () => (pathsKey ? pathsKey.split("\0") : []),
    [pathsKey],
  );

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading" });
      return;
    }

    let alive = true;
    const year = new Date().getFullYear();

    setState({ status: "loading" });
    void scanProjectSessions(paths)
      .then((rows) => {
        if (!alive) return;
        const timestamps = rows
          .filter((row) => !row.archived)
          .map((row) => row.updatedAt);
        setState({
          status: "ready",
          grid: buildActivityYear(timestamps, year),
        });
      })
      .catch((error: unknown) => {
        console.error("Failed to load session activity:", error);
        if (!alive) return;
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Activity unavailable",
        });
      });

    return () => {
      alive = false;
    };
  }, [enabled, paths]);

  return state;
}
