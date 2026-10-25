import type { Session } from "@/domain/session/session";
import {
  readSession,
  upsertSession,
} from "@/features/sessions/data/session-store";
import { mergeProjectHistorySummary } from "@/features/sessions/data/session-history";
import { createSessionLoader } from "../../flows/session-history/session-loader";
import { createSessionPersistence } from "../../flows/session-history/session-persistence";
import type { WorkspaceStore } from "../../store/types";
import { useStableFlow } from "../use-stable-flow";

export type SessionStorageInput = {
  store: WorkspaceStore;
  sessionsRef: { readonly current: Session[] };
  switchingWorktrees: { readonly current: Map<string, string> };
  /** Read lazily: the sidebar folder is derived later in the render. */
  sidebarCwd: () => string;
};

export function createSessionStorage({ store, sessionsRef, switchingWorktrees, sidebarCwd }: SessionStorageInput) {
  const removingSessionIds = { current: new Set<string>() };
  const loadedSessionCache = { current: new Map<string, Session>() };
  const openingSessionIds = { current: new Set<string>() };

  const sessionPersistence = createSessionPersistence({
    upsert: upsertSession,
    isBlocked: (sessionId) =>
      removingSessionIds.current.has(sessionId) ||
      switchingWorktrees.current.has(sessionId),
    onSaved: (summary) => {
      if (summary.cwd !== sidebarCwd()) return;
      store.getState().setHistory((current) => mergeProjectHistorySummary(current, summary));
    },
  });
  const sessionLoader = createSessionLoader({
    cache: loadedSessionCache.current,
    opening: openingSessionIds.current,
    get: readSession,
    isRemoving: (sessionId) => removingSessionIds.current.has(sessionId),
    isOpen: (sessionId) =>
      sessionsRef.current.some((session) => session.id === sessionId),
  });

  return { removingSessionIds, loadedSessionCache, openingSessionIds, sessionPersistence, sessionLoader };
}

/** Chat saving and loading, with the id sets that block or track them; built once. */
export function useSessionStorage(input: SessionStorageInput): ReturnType<typeof createSessionStorage> {
  return useStableFlow(() => createSessionStorage(input));
}
