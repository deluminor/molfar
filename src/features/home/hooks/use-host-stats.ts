import { useEffect, useState } from "react";
import { pushHostSample, type HostSamplePoint } from "../model/host-history";
import { fetchHostStats, type HostStats } from "../model/host-stats";

const HOST_POLL_MS = 2_000;

export type HostStatsState = {
  host: HostStats | null;
  history: HostSamplePoint[];
  error: string | null;
};

/** Polls host stats while the document is visible. */
export function useHostStats(): HostStatsState {
  const [host, setHost] = useState<HostStats | null>(null);
  const [history, setHistory] = useState<HostSamplePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (): void => {
      clearTimer();
      timer = setTimeout(tick, HOST_POLL_MS);
    };

    const tick = (): void => {
      if (!alive || document.hidden) return;
      void fetchHostStats()
        .then((next) => {
          if (!alive) return;
          setHost(next);
          setHistory((previous) => pushHostSample(previous, next));
          setError(null);
        })
        .catch((reason: unknown) => {
          if (!alive) return;
          setError(
            reason instanceof Error ? reason.message : "Host stats unavailable",
          );
        })
        .finally(() => {
          if (alive && !document.hidden) schedule();
        });
    };

    const onVisibility = (): void => {
      clearTimer();
      if (document.hidden) return;
      tick();
    };

    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { host, history, error };
}
