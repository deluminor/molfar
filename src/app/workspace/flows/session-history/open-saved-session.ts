import type { Session } from "@/domain/session/session";
import type { SessionLoader } from "./session-loader";
import type { SessionPersistence } from "./session-persistence";

export type OpenSavedSessionDeps = {
  openSessions(): Session[];
  /** Publishes sessions through Workspace's ref and the store. */
  commitSessions(next: Session[]): void;
  loader: SessionLoader;
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

  return restored;
}
