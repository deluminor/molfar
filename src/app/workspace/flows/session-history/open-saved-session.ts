import type { Session } from "@/domain/session/session";
import { applySessionRepair } from "@/features/sessions/data/session-store";
import type { SessionLoader } from "./session-loader";
import type { SessionPersistence } from "./session-persistence";

export type OpenSavedSessionDeps = {
  openSessions(): Session[];
  /** Publishes sessions through Workspace's ref and the store. */
  commitSessions(next: Session[]): void;
  loader: SessionLoader;
  /** Provider log repairs (shell labels, subagent trails, interjections), without saving. */
  repair(session: Session): Promise<Session>;
  updateSessions(update: (sessions: Session[]) => Session[]): void;
  /** Sessions on their way into the window, shared with idle detach. */
  opening: Set<string>;
  cache: Map<string, Session>;
  isRemoving(sessionId: string): boolean;
  persistence: SessionPersistence;
  refreshHistory(): void;
  /** Lets the provider resume the session's conversation. */
  bindProvider(session: Session): void;
};

/**
 * Returns the session open in the window, loading a saved one into it first.
 * Null when it no longer exists or is being removed.
 */
export async function openSavedSession(
  deps: OpenSavedSessionDeps,
  sessionId: string,
): Promise<Session | null> {
  const find = () =>
    deps.openSessions().find((session) => session.id === sessionId);
  const open = find();
  if (open) return open;

  deps.opening.add(sessionId);
  const restored = await deps.loader.load(sessionId);
  if (!restored || deps.isRemoving(sessionId)) {
    deps.opening.delete(sessionId);
    deps.refreshHistory();
    return null;
  }

  deps.cache.delete(sessionId);
  const appeared = find();
  if (appeared) return appeared;

  deps.bindProvider(restored);
  deps.persistence.markSaved(restored);
  deps.commitSessions([...deps.openSessions(), restored]);
  // Provider log reads must not sit between the hotkey and the saved
  // conversation; apply them later only if this transcript has not advanced.
  void deps
    .repair(restored)
    .then((repaired) => {
      if (repaired.blocks === restored.blocks) return;
      deps.updateSessions((current) => applyRepair(current, restored, repaired));
    })
    .catch(() => undefined);

  return restored;
}

function applyRepair(current: Session[], restored: Session, repaired: Session): Session[] {
  let changed = false;
  const next = current.map((session) => {
    if (session.id !== restored.id) return session;
    const repairedSession = applySessionRepair(session, restored, repaired);
    changed ||= repairedSession !== session;
    return repairedSession;
  });

  return changed ? next : current;
}
