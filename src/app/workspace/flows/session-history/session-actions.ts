import type { Session } from "@/domain/session/session";
import { formatSessionTitle } from "@/domain/session/title";
import { rememberLoadedSession } from "@/features/sessions/data/session-cache";
import {
  mergeProjectHistorySummary,
  summaryFromSession,
} from "@/features/sessions/data/session-history";
import {
  type SessionSummary,
  shouldPersistSession,
} from "@/features/sessions/data/session-store";
import type { WorkspaceStore } from "../../store/types";
import type { SessionLoader } from "./session-loader";
import type { SessionPersistence } from "./session-persistence";

export type SessionActionsDeps = {
  store: WorkspaceStore;
  /** Sessions open in the window, as Workspace last published them. */
  openSessions(): Session[];
  loader: SessionLoader;
  persistence: SessionPersistence;
  /** Closed sessions already read; shared with the loader. */
  cache: Map<string, Session>;
  /** Re-lists the project the sidebar shows. */
  refreshHistory(): void;
  getSession(sessionId: string): Promise<Session | null>;
  upsertSession(session: Session): Promise<SessionSummary | null>;
  setSessionPinned(sessionId: string, pinned: boolean): Promise<void>;
};

function openSession(deps: SessionActionsDeps, sessionId: string) {
  return deps.openSessions().find((session) => session.id === sessionId);
}

/** Renames a session, open or saved, keeping the provider prefix in the title. */
export async function renameSession(
  deps: SessionActionsDeps,
  sessionId: string,
  displayTitle: string,
): Promise<void> {
  const trimmed = displayTitle.trim();
  if (!trimmed) return;
  deps.loader.invalidate(sessionId);

  const open = openSession(deps, sessionId);
  if (open) {
    const updated = {
      ...open,
      title: formatSessionTitle(open.harness, trimmed),
    };
    deps.store
      .getState()
      .setSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId ? updated : session,
        ),
      );
    deps.cache.delete(sessionId);
    deps.persistence.persist(updated);
    deps.refreshHistory();
    return;
  }

  const restored = await deps.getSession(sessionId).catch(() => null);
  if (!restored) {
    deps.refreshHistory();
    return;
  }

  const updated = {
    ...restored,
    title: formatSessionTitle(restored.harness, trimmed),
  };
  const saved = await deps.upsertSession(updated).catch(() => null);
  if (saved) {
    rememberLoadedSession(deps.cache, updated);
    deps.persistence.markSaved(updated);
  }
  deps.refreshHistory();
}

/** Pins or unpins a session, saving an open one first so its row exists. */
export async function pinSession(
  deps: SessionActionsDeps,
  sessionId: string,
  pinned: boolean,
): Promise<void> {
  const open = openSession(deps, sessionId);
  if (open && shouldPersistSession(open)) {
    await deps.upsertSession(open).catch(() => undefined);
  }
  await deps.setSessionPinned(sessionId, pinned).catch(() => undefined);

  deps.store.getState().setHistory((current) => {
    const existing = current.find((entry) => entry.id === sessionId);
    if (existing) {
      return mergeProjectHistorySummary(current, { ...existing, pinned });
    }
    if (!open) return current;

    return mergeProjectHistorySummary(current, {
      ...summaryFromSession(open),
      pinned,
    });
  });
}
