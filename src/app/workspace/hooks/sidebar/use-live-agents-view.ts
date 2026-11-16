import { useMemo } from "react";
import type { Session } from "@/domain/session/session";
import { listFamiliars } from "@/features/familiars/model/familiar";
import { type LiveAgent, liveAgentsFromSessions } from "@/features/sessions/model/live-agents";
import { useStableValue } from "@/shared/hooks/use-stable-value";

type LiveAgentsViewInput = {
  liveAgentsEnabled: boolean;
  promptableSessions: Session[];
  unseenFinishedIds: ReadonlySet<string>;
  /** The Familiar roster's snapshot; the roster itself is read through it. */
  familiarsSnap: unknown;
  dismissedLiveAgentIds: ReadonlySet<string>;
};

/** The working rail's agents (Familiars and dismissed finished cards left out). */
export function useLiveAgentsView({
  liveAgentsEnabled,
  promptableSessions,
  unseenFinishedIds,
  familiarsSnap,
  dismissedLiveAgentIds,
}: LiveAgentsViewInput): LiveAgent[] {
  const liveAgentRows = useMemo(() => {
    if (!liveAgentsEnabled) return [];
    return liveAgentsFromSessions(
      promptableSessions,
      unseenFinishedIds,
      new Set(
        listFamiliars().flatMap((familiar) =>
          familiar.sessionId ? [familiar.sessionId] : [],
        ),
      ),
    ).filter(
      (agent) => !agent.done || !dismissedLiveAgentIds.has(agent.id),
    );
  }, [
    liveAgentsEnabled,
    promptableSessions,
    unseenFinishedIds,
    familiarsSnap,
    dismissedLiveAgentIds,
  ]);

  // Rebuilt for every streamed batch; identity only moves when a row does.
  return useStableValue(liveAgentRows);
}
