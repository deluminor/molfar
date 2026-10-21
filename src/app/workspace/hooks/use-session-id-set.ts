import { useMemo, useRef } from "react";
import type { Session } from "@/domain/session/session";
import { sessionIdsWithLeads, setsEqual } from "../../model/session-id-sets";

/**
 * The matching sessions' ids with their leads. The set keeps its identity
 * while its contents stay the same, so a stream that leaves it unchanged
 * does not re-render what reads it. `matches` must be stable.
 */
export function useSessionIdSet(
  sessions: readonly Session[],
  matches: (session: Session) => boolean,
): Set<string> {
  const next = useMemo(() => sessionIdsWithLeads(sessions, matches), [sessions, matches]);
  const kept = useRef(next);
  if (!setsEqual(kept.current, next)) kept.current = next;

  return kept.current;
}
