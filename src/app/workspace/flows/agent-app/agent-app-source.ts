import { flushSync } from "react-dom";
import type { FamiliarSpawnedSession } from "@/domain/session/familiar-session";
import type { Session } from "@/domain/session/session";
import { canAccessAgentAppProject } from "@/features/agent-app/model/agent-app";
import { familiarForSession, findFamiliar, isFamiliarSession } from "@/features/familiars/model/familiar";
import { habitRunFamiliar, isHabitRun, noteHabitRunLaunch } from "@/features/familiars/model/familiar-habits";
import {
  dismissQueuedFamiliarSessionCompletion,
  familiarSessionCompletionResult,
} from "@/features/familiars/model/familiar-session-completion";
import { recordFamiliarSpawnedSession } from "@/features/familiars/model/familiar-spawned-sessions";
import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import { groupFamiliarTurns } from "@/features/sessions/model/transcript-activity";
import type { AgentAppDeps } from "./agent-app-deps";

/** The session a CLI request comes from, and what its requests do on its behalf. */
export function createRequestSource(deps: AgentAppDeps, source: Session) {
  const sourceFamiliar = familiarForSession(source.id) ?? findFamiliar(habitRunFamiliar(source.id) ?? "");
  const sourceTurn = deps.turnGen.current.get(source.id) ?? 0;
  const sourceTurns = isFamiliarSession(source.id) ? groupFamiliarTurns(source.blocks) : [];
  const sourceTurnId = sourceTurns[sourceTurns.length - 1]?.[0]?.id;

  const canAccessProject = (cwd: string) => canAccessAgentAppProject(source, cwd, sourceFamiliar?.projects);

  /** Notes a session the request started or messaged on the source's current turn. */
  const rememberSession = (entry: FamiliarSpawnedSession): void => {
    // A habit run is thrown away when it ends; its launches go on the
    // report it posts to the Familiar's chat instead.
    if (isHabitRun(source.id)) {
      noteHabitRunLaunch(source.id, entry);
      return;
    }
    if (!sourceTurnId) return;
    const next = deps.sessionsRef.current.map((session) =>
      session.id === source.id ? recordFamiliarSpawnedSession(session, sourceTurnId, entry) : session,
    );
    if (next.every((session, index) => session === deps.sessionsRef.current[index])) return;
    deps.sessionsRef.current = next;
    deps.setSessions(next);
  };

  /** Reports a started session's outcome back to the Familiar that asked for it. */
  const monitorCompletion = (
    familiarId: string,
    sessionId: string,
    requestId: string,
    project: string,
    prompt: string,
  ) => {
    const settle = deps.completions.watch({ familiarId, turn: sourceTurn }, requestId, sessionId, {
      awaitAcceptance: true,
    });
    return Object.assign(
      (outcome: ControlOutcome) =>
        settle(
          familiarSessionCompletionResult({
            requestId,
            sessionId,
            project,
            prompt,
            outcome,
            session: deps.sessionsRef.current.find((session) => session.id === sessionId),
          }),
        ),
      { accept: settle.accept, discard: settle.discard },
    );
  };

  const dismissCompletion = (sessionId: string): void => {
    if (!isFamiliarSession(source.id)) return;
    deps.completions.dismissSession(source.id, sessionId);
    flushSync(() =>
      deps.setSessions((previous) =>
        previous.map((session) =>
          session.id === source.id ? dismissQueuedFamiliarSessionCompletion(session, sessionId) : session,
        ),
      ),
    );
  };

  return { source, sourceTurnId, canAccessProject, rememberSession, monitorCompletion, dismissCompletion };
}

export type RequestSource = ReturnType<typeof createRequestSource>;
