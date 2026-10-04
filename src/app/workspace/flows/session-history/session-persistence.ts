import type { Session } from "@/domain/session/session";
import { lastUserBlockId } from "@/domain/session/session-state";
import {
  persistFingerprint,
  type SessionSummary,
  shouldPersistSession,
} from "@/features/sessions/data/session-store";

export type SessionPersistenceDeps = {
  upsert(session: Session): Promise<SessionSummary | null>;
  /** Sessions being removed or moved between worktrees must not be written. */
  isBlocked(sessionId: string): boolean;
  onSaved(summary: SessionSummary): void;
};

export type SessionPersistence = {
  /** Writes a session now unless nothing changed since its last save. */
  persist(session: Session | undefined): void;
  /**
   * Notes sessions that changed since the last call: a new user turn or a
   * newly bound provider conversation is written at once, the rest waits for
   * `writePending`. Returns whether anything waits.
   */
  observe(sessions: readonly Session[], openSessionIds: Set<string>): boolean;
  writePending(): Promise<void>;
  /** A session that arrived saved (resumed or transferred) needs no write. */
  markImported(session: Session): void;
  markSaved(session: Session): void;
  forgetSaved(sessionId: string): void;
  dropPending(sessionId: string): void;
  forgetUserTurn(sessionId: string): void;
  /** Rewrites sessions still waiting to be written. */
  mapPending(update: (session: Session) => Session): void;
};

export function createSessionPersistence(
  deps: SessionPersistenceDeps,
): SessionPersistence {
  const lastPersisted = new Map<string, string>();
  const lastBoundProvider = new Map<string, string>();
  const lastPersistedUserBlock = new Map<string, string>();
  const observed = new Map<string, Session>();
  let pending = new Map<string, Session>();

  const write = async (session: Session) => {
    const fingerprint = persistFingerprint(session);
    // Leaving a session flushes it. An unchanged one would still rewrite and
    // re-diff its whole transcript under the store lock, stalling the next load.
    if (lastPersisted.get(session.id) === fingerprint) return;

    const summary = await deps.upsert(session).catch(() => null);
    if (!summary) return;

    lastPersisted.set(session.id, fingerprint);
    deps.onSaved(summary);
  };

  const persist = (session: Session | undefined) => {
    if (!session || !shouldPersistSession(session)) return;
    if (deps.isBlocked(session.id)) return;

    void write(session);
  };

  const observeOne = (session: Session, openSessionIds: Set<string>) => {
    if (deps.isBlocked(session.id)) return;
    if (observed.get(session.id) === session) return;
    observed.set(session.id, session);

    const parked = !openSessionIds.has(session.id);
    const providerSessionId = session.providerSessionId;
    const newlyBound =
      !!providerSessionId &&
      lastBoundProvider.get(session.id) !== providerSessionId;
    const lastUserId = lastUserBlockId(session);
    const newUserTurn =
      !!lastUserId && lastPersistedUserBlock.get(session.id) !== lastUserId;

    if (newlyBound && providerSessionId) {
      lastBoundProvider.set(session.id, providerSessionId);
    }
    if (newUserTurn && lastUserId) {
      lastPersistedUserBlock.set(session.id, lastUserId);
    }
    if (!shouldPersistSession(session)) return;

    if (newlyBound || newUserTurn) persist(session);
    const settledOrUnsaved =
      !session.busy || parked || newlyBound || newUserTurn;
    if (settledOrUnsaved || !lastPersisted.has(session.id)) {
      pending.set(session.id, session);
    }
  };

  const observe = (
    sessions: readonly Session[],
    openSessionIds: Set<string>,
  ) => {
    for (const session of sessions) observeOne(session, openSessionIds);

    const liveIds = new Set(sessions.map((session) => session.id));
    for (const sessionId of observed.keys()) {
      if (liveIds.has(sessionId)) continue;
      observed.delete(sessionId);
      pending.delete(sessionId);
    }

    return pending.size > 0;
  };

  const writePending = async () => {
    const dirty = [...pending.values()];
    pending = new Map();
    await Promise.all(
      dirty.map(async (session) => {
        if (deps.isBlocked(session.id)) return;
        await write(session);
      }),
    );
  };

  return {
    persist,
    observe,
    writePending,
    markImported(session) {
      observed.set(session.id, session);
      lastPersisted.set(session.id, persistFingerprint(session));
      const userId = lastUserBlockId(session);
      if (userId) lastPersistedUserBlock.set(session.id, userId);
      if (session.providerSessionId) {
        lastBoundProvider.set(session.id, session.providerSessionId);
      }
    },
    markSaved(session) {
      lastPersisted.set(session.id, persistFingerprint(session));
    },
    forgetSaved(sessionId) {
      lastPersisted.delete(sessionId);
    },
    dropPending(sessionId) {
      pending.delete(sessionId);
    },
    forgetUserTurn(sessionId) {
      lastPersistedUserBlock.delete(sessionId);
    },
    mapPending(update) {
      for (const [id, session] of pending) pending.set(id, update(session));
    },
  };
}
