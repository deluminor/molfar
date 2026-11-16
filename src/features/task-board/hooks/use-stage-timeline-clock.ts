import { useCallback, useEffect, useState } from "react";
import type { StageRun } from "../types/stage";

export function useStageTimelineClock(
  runs: readonly StageRun[],
  cardId: string,
): { now: number; refresh: () => void } {
  const [now, setNow] = useState(Date.now);
  const refresh = useCallback(() => setNow(Date.now()), []);
  const live = runs.some(
    (run) => Number.isFinite(run.startedAt) && run.completedAt === null,
  );

  useEffect(() => {
    refresh();
    if (!live) return;
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [live, cardId, refresh]);

  return { now, refresh };
}
