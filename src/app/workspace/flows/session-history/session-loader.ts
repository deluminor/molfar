import type { Session } from "@/domain/session/session";
import { rememberLoadedSession } from "@/features/sessions/data/session-cache";

export type SessionLoaderDeps = {
  /** Closed sessions already read, shared with idle detach. */
  cache: Map<string, Session>;
  /** Sessions on their way into the window, shared with idle detach. */
  opening: Set<string>;
  get(sessionId: string): Promise<Session | null>;
  isRemoving(sessionId: string): boolean;
  isOpen(sessionId: string): boolean;
};

export type SessionLoader = {
  /** Reads a saved session once, however many callers ask at the same time. */
  load(sessionId: string): Promise<Session | null>;
  /** Reads one saved session ahead of a likely click, one at a time. */
  prefetch(sessionId: string): void;
  /** Drops what is cached or loading, and makes a running read land as null. */
  invalidate(sessionId: string): void;
  loadingIds(): string[];
};

export function createSessionLoader(deps: SessionLoaderDeps): SessionLoader {
  const loads = new Map<string, Promise<Session | null>>();
  const epochs = new Map<string, number>();
  let prefetching: Promise<Session | null> | null = null;

  const load = (sessionId: string) => {
    const cached = deps.cache.get(sessionId);
    if (cached) {
      // The cache owns closed sessions only. Transfer this reference into
      // live state instead of retaining a stale duplicate while it changes.
      deps.cache.delete(sessionId);
      return Promise.resolve(cached);
    }

    const pending = loads.get(sessionId);
    if (pending) return pending;

    const epoch = epochs.get(sessionId) ?? 0;
    const loading = deps
      .get(sessionId)
      .then((loaded) => {
        const stale = (epochs.get(sessionId) ?? 0) !== epoch;
        if (!loaded || deps.isRemoving(sessionId) || stale) return null;
        return loaded;
      })
      .catch(() => null);
    loads.set(sessionId, loading);
    void loading.then(() => {
      if (loads.get(sessionId) === loading) loads.delete(sessionId);
    });

    return loading;
  };

  const prefetch = (sessionId: string) => {
    const known =
      deps.isRemoving(sessionId) ||
      deps.isOpen(sessionId) ||
      deps.cache.has(sessionId) ||
      loads.has(sessionId);
    if (known || prefetching) return;

    const loading = load(sessionId);
    prefetching = loading;
    void loading.then((loaded) => {
      const stillClosed =
        !deps.isRemoving(sessionId) && !deps.isOpen(sessionId);
      if (loaded && stillClosed) rememberLoadedSession(deps.cache, loaded);
      if (prefetching === loading) prefetching = null;
    });
  };

  const invalidate = (sessionId: string) => {
    deps.opening.delete(sessionId);
    deps.cache.delete(sessionId);
    loads.delete(sessionId);
    epochs.set(sessionId, (epochs.get(sessionId) ?? 0) + 1);
  };

  return {
    load,
    prefetch,
    invalidate,
    loadingIds: () => [...loads.keys()],
  };
}
