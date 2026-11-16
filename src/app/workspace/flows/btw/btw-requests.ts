/** Side questions in flight, one per thread, so they can be stopped or replaced. */
export function createBtwRequests() {
  const requests = new Map<string, { sessionId: string; controller: AbortController }>();
  const key = (sessionId: string, threadId: string) => `${sessionId}:${threadId}`;

  return {
    /** Aborts the thread's earlier request and tracks a new one. */
    start(sessionId: string, threadId: string): AbortController {
      requests.get(key(sessionId, threadId))?.controller.abort();
      const controller = new AbortController();
      requests.set(key(sessionId, threadId), { sessionId, controller });
      return controller;
    },
    finish(sessionId: string, threadId: string, controller: AbortController): void {
      if (requests.get(key(sessionId, threadId))?.controller === controller)
        requests.delete(key(sessionId, threadId));
    },
    abort(sessionId: string, threadId: string): void {
      requests.get(key(sessionId, threadId))?.controller.abort();
      requests.delete(key(sessionId, threadId));
    },
    /** Aborts the requests of sessions no longer open. */
    abortClosed(liveSessionIds: ReadonlySet<string>): void {
      for (const [entryKey, request] of requests) {
        if (liveSessionIds.has(request.sessionId)) continue;
        request.controller.abort();
        requests.delete(entryKey);
      }
    },
    abortAll(): void {
      for (const request of requests.values()) request.controller.abort();
      requests.clear();
    },
  };
}

export type BtwRequests = ReturnType<typeof createBtwRequests>;
