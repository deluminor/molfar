import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@/domain/session/session";
import type { WorkspaceStore } from "../../store/types";
import type { Submit } from "../submission/submit-types";

/** What the orchestrator's workers are created, run and cleaned up through. */
export type WorkerDeps = {
  store: WorkspaceStore;
  sessionsRef: { current: Session[] };
  setSessions: Dispatch<SetStateAction<Session[]>>;
  submitSession: Submit;
  /** Stops a session's turn on the orchestrator's behalf. */
  stop(sessionId: string, managed: boolean): unknown;
  flushHarnessEvents(): void;
  /** Throws while a file or terminal is still open in the worktree. */
  checkOpenWorktreeFiles(path: string): void;
};

export function findSession(deps: WorkerDeps, id: string): Session | undefined {
  return deps.sessionsRef.current.find((session) => session.id === id);
}

export function commitSessions(deps: WorkerDeps, next: Session[]): void {
  deps.sessionsRef.current = next;
  deps.setSessions(next);
}
