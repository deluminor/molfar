import { useEffect, useRef, useState } from "react";
import type { Session } from "@/domain/session/session";
import type { Submit } from "../flows/submission/submit-types";
import { canSendQueuedHead, dispatchQueuedHead } from "../flows/turn-queue/queue-dispatch";
import { mapSession, type TurnQueueDeps } from "../flows/turn-queue/turn-queue-deps";

/** Drains each session's follow-up queue, one head at a time. */
export function useQueueDispatch(
  sessions: Session[],
  deps: Pick<TurnQueueDeps, "sessions" | "updateSessions">,
  submitSession: Submit,
): void {
  const dispatchingRef = useRef(new Set<string>());
  const [dispatchVersion, setDispatchVersion] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a sent head re-checks every queue
  useEffect(() => {
    const dispatching = dispatchingRef.current;
    const timers: number[] = [];
    const scheduled = new Set<string>();
    const dispatchDeps = {
      ...deps,
      submitSession,
      dispatching,
      redispatch: () => setDispatchVersion((value) => value + 1),
    };

    for (const session of sessions) {
      const next = session.queuedMessages?.[0];
      if (!next) continue;

      if (!session.busy && session.queueStatus === "resuming") {
        deps.updateSessions(mapSession(session.id, (entry) => ({ ...entry, queueStatus: "active" })));
        continue;
      }
      if (!canSendQueuedHead(session, next) || dispatching.has(session.id)) continue;

      dispatching.add(session.id);
      scheduled.add(session.id);
      timers.push(
        window.setTimeout(() => {
          scheduled.delete(session.id);
          void dispatchQueuedHead(dispatchDeps, session.id, next.id);
        }, 0),
      );
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const id of scheduled) dispatching.delete(id);
    };
  }, [deps, submitSession, sessions, dispatchVersion]);
}
