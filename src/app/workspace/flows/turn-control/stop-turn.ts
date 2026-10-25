import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { remoteProjectFor } from "@/features/connections/model/remote-projects";
import { remoteSessionActions } from "@/features/connections/model/remote-session-actions";
import { nudgeWatchedFiles } from "@/features/files/model/file-watch";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { finishSessionTurn, notifyReviewChanged } from "@/features/sessions/model/checkpoint";
import {
  buildDeterministicHandoff,
  completeHandoff,
  isPreparingHandoff,
  sessionChildHarnesses,
} from "@/features/sessions/model/handoff";
import { cancelHarnessTurn, stopHarnessSession, stopStreaming } from "@/integrations/harness";
import { notifyGitChanged } from "@/platform/tauri/fs";
import { nudgeWorkspace } from "../../../model/nudge-workspace";
import type { TurnControlDeps } from "./turn-control-deps";

/** A stopped session: streaming ended, a pending handoff settled, its queue paused. */
export function stoppedSession(session: Session): Session {
  const stopped = stopStreaming(session);
  const completed = isPreparingHandoff(stopped)
    ? completeHandoff(stopped, buildDeterministicHandoff(stopped))
    : stopped;
  const ready = { ...completed, worktreePreparing: undefined };

  return ready.queuedMessages?.length ? { ...ready, queueStatus: "paused" } : ready;
}

/**
 * Stops the session's running turn. An orchestration lead stops its run
 * instead unless `managed` (the orchestrator itself is stopping it).
 */
export function stopTurn(
  deps: TurnControlDeps,
  sessionId: string,
  managed = false,
): Promise<unknown> | undefined {
  const session = deps.sessions().find((entry) => entry.id === sessionId);
  if (session && remoteProjectFor(session.cwd)) {
    remoteSessionActions(sessionId)?.stop();
    return undefined;
  }
  if (!managed) {
    const stopping = orchestrator.stopForSession(sessionId);
    if (stopping) {
      void stopping.catch(console.error);
      return stopping;
    }
  }

  deps.turnGen.set(sessionId, (deps.turnGen.get(sessionId) ?? 0) + 1);
  deps.flushHarnessEvents();
  const cancelling = Promise.all(
    (session ? sessionChildHarnesses(session) : []).map(async (id) => {
      try {
        await cancelHarnessTurn(id, sessionId);
      } finally {
        await stopHarnessSession(id, sessionId);
      }
    }),
  );
  const checkpointFinished = session
    ? finishSessionTurn(sessionId, sessionWorkCwd(session), {
        after: cancelling.catch(() => undefined),
      })
    : Promise.resolve();
  void cancelling.catch(console.error);
  deps.updateSessions((prev) =>
    prev.map((entry) => (entry.id === sessionId ? stoppedSession(entry) : entry)),
  );

  notifyReviewChanged(sessionId);
  if (session) {
    nudgeWorkspace(sessionWorkCwd(session));
    notifyGitChanged();
    nudgeWatchedFiles();
    window.setTimeout(() => nudgeWatchedFiles(), 150);
  }
  return Promise.all([cancelling, checkpointFinished]);
}
