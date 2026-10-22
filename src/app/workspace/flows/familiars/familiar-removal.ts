import type { Session } from "@/domain/session/session";
import { findFamiliar, familiarLook, isFamiliarSession, removeFamiliar } from "@/features/familiars/model/familiar";
import { resetFamiliarSession } from "@/features/familiars/model/familiar-workspace";
import { sessionChildHarnesses } from "@/features/sessions/model/handoff";
import { forgetHarnessSession, stopStreaming } from "@/integrations/harness";
import { confirmApp } from "@/shared/lib/app-dialog";
import type { WorkspaceStore } from "../../store/types";
import type { SessionPersistence } from "../session-history/session-persistence";
import type { FamiliarView } from "./familiar-view";

export type FamiliarRemovalDeps = {
  store: WorkspaceStore;
  sessionsRef: { current: Session[] };
  removingSessionIds: { readonly current: Set<string> };
  persistence: Pick<SessionPersistence, "dropPending" | "forget">;
  view: Pick<FamiliarView, "close" | "forget" | "replaceSession">;
  commitSessions(next: Session[]): void;
  invalidateLoadedSession(sessionId: string): void;
  stopSessionForRemoval(sessionId: string): Promise<Session | undefined>;
  flushCheckpoint(sessionId: string): Promise<void>;
  deleteStoredSession(sessionId: string, imagePaths: string[]): Promise<void>;
  removeSession(sessionId: string, mode: "delete", skipDeleteConfirm: boolean): Promise<boolean>;
};

function imagePathsOf(session: Session): string[] {
  return session.blocks.flatMap((block) => (block.role === "image" && block.image ? [block.image.path] : []));
}

/** Starts the Familiar's chat over, keeping its identity, habits and memory. */
export async function resetFamiliar(deps: FamiliarRemovalDeps, sessionId: string): Promise<void> {
  const current = deps.sessionsRef.current.find((session) => session.id === sessionId);
  if (!current || !isFamiliarSession(sessionId))
    throw new Error("This Familiar's conversation is no longer available.");
  if (deps.removingSessionIds.current.has(sessionId)) throw new Error("This conversation is already being reset.");

  deps.removingSessionIds.current.add(sessionId);
  deps.persistence.dropPending(sessionId);
  deps.invalidateLoadedSession(sessionId);
  try {
    await resetFamiliarSession(current, {
      stop: async (id) => {
        const latest = (await deps.stopSessionForRemoval(id)) ?? current;
        const stopped = { ...stopStreaming(latest), queueStatus: "paused" as const };
        deps.commitSessions(deps.sessionsRef.current.map((session) => (session.id === id ? stopped : session)));
        return stopped;
      },
      remove: async (stopped) => {
        await Promise.all(sessionChildHarnesses(stopped).map((harness) => forgetHarnessSession(harness, sessionId)));
        await deps.flushCheckpoint(sessionId);
        await deps.deleteStoredSession(sessionId, imagePathsOf(stopped));
      },
      replace: (fresh) => {
        const { setHistory, setStoredLinkedSessions } = deps.store.getState();
        deps.persistence.forget(sessionId);
        deps.invalidateLoadedSession(sessionId);
        deps.commitSessions(deps.sessionsRef.current.map((session) => (session.id === sessionId ? fresh : session)));
        setHistory((history) => history.filter((entry) => entry.id !== sessionId));
        setStoredLinkedSessions((history) => history.filter((entry) => entry.id !== sessionId));
        deps.view.replaceSession(sessionId, fresh.id);
      },
    });
  } finally {
    deps.removingSessionIds.current.delete(sessionId);
  }
}

/** Deletes the Familiar's conversation, then the Familiar. Its files stay on disk. */
export async function deleteFamiliar(deps: FamiliarRemovalDeps, familiarId: string): Promise<void> {
  const familiar = findFamiliar(familiarId);
  if (!familiar) return;

  const { name } = familiarLook(familiar);
  const confirmed = await confirmApp(
    `Delete ${name}? Its conversation will be deleted and its habits stop. This can’t be undone.`,
    { title: "MOLFAR", kind: "warning", okLabel: "Delete" },
  );
  if (!confirmed) return;

  const { sessionId } = familiar;
  if (sessionId) {
    const state = deps.store.getState();
    if (state.familiarViewId === sessionId) deps.view.close();
    const exists =
      deps.sessionsRef.current.some((session) => session.id === sessionId) ||
      state.history.some((entry) => entry.id === sessionId);
    if (exists && !(await deps.removeSession(sessionId, "delete", true))) return;
  }

  removeFamiliar(familiarId);
  deps.view.forget(familiarId);
}
