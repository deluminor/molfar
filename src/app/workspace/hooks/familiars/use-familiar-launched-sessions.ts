import { useEffect, useMemo, useState } from "react";
import type { MonoSpawnedSession } from "@/domain/session/familiar-session";
import type { Session } from "@/domain/session/session";
import {
  type LaunchedSessionState,
  type LaunchedSessionView,
  launchedSessionState,
} from "@/features/familiars/model/familiar-spawned-sessions";
import { getSession } from "@/features/sessions/data/session-store";

/**
 * Status for the cards of the sessions the open Familiar launched, rebuilt only
 * when one changes state or title rather than on every streamed token. One
 * that is no longer open cannot be running, so it reads as done.
 *
 * A card names its session as the sidebar does. One that is not open has its
 * saved title fetched, rather than the prompt it was launched with, so opening
 * it does not rename the card.
 */
export function useFamiliarLaunchedSessions(
  launches: readonly MonoSpawnedSession[],
  sessions: readonly Session[],
): Map<string, LaunchedSessionView> {
  const [storedLaunchTitles, setStoredLaunchTitles] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const unopenedLaunchesKey = JSON.stringify(
    launches.flatMap((launch) =>
      storedLaunchTitles.has(launch.sessionId) ||
      sessions.some((entry) => entry.id === launch.sessionId)
        ? []
        : [launch.sessionId],
    ),
  );

  useEffect(() => {
    const ids: string[] = JSON.parse(unopenedLaunchesKey);
    if (ids.length === 0) return;

    let current = true;
    void Promise.all(ids.map((id) => getSession(id).catch(() => null))).then(
      (stored) => {
        if (!current) return;
        setStoredLaunchTitles((previous) => {
          const next = new Map(previous);
          stored.forEach((session, index) => {
            next.set(ids[index], session?.title ?? "");
          });
          return next;
        });
      },
    );
    return () => {
      current = false;
    };
  }, [unopenedLaunchesKey]);

  const launchesKey = JSON.stringify(
    launches.map((launch) => {
      const live = sessions.find((entry) => entry.id === launch.sessionId);
      return live
        ? [launch.sessionId, launchedSessionState(live), live.title]
        : [
            launch.sessionId,
            "done",
            storedLaunchTitles.get(launch.sessionId) || launch.title,
          ];
    }),
  );

  return useMemo(
    () =>
      new Map<string, LaunchedSessionView>(
        (JSON.parse(launchesKey) as [string, LaunchedSessionState, string][]).map(
          ([id, state, title]) => [id, { state, title }],
        ),
      ),
    [launchesKey],
  );
}
