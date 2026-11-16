import { useRef } from "react";
import { isLiveAgentSession } from "../model/live-agents";
import type { Session } from "@/domain/session/session";
import { nextUnseenFinishedSessions } from "../model/session-done";

export function useUnseenFinishedSessions(
  sessions: Session[],
  busySessionIds: ReadonlySet<string>,
  activeSessionId?: string,
): Set<string> {
  const busyForDoneRef = useRef(busySessionIds);
  const focusedForDoneRef = useRef(activeSessionId);
  const unseenFinishedRef = useRef<Set<string>>(new Set());
  if (
    busyForDoneRef.current !== busySessionIds ||
    focusedForDoneRef.current !== activeSessionId
  ) {
    unseenFinishedRef.current = nextUnseenFinishedSessions({
      previousBusyIds: busyForDoneRef.current,
      busyIds: busySessionIds,
      previousUnseenIds: unseenFinishedRef.current,
      focusedSessionId: activeSessionId,
      untrackedIds: new Set(
        sessions
          .filter((session) => !isLiveAgentSession(session))
          .map((session) => session.id),
      ),
    });
    busyForDoneRef.current = busySessionIds;
    focusedForDoneRef.current = activeSessionId;
  }
  return unseenFinishedRef.current;
}
