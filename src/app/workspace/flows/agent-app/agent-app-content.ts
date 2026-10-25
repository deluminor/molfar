import type { Session } from "@/domain/session/session";
import { recordArtifactCard } from "@/features/artifacts/artifacts";
import { familiarForSession, familiarLook, findFamiliar } from "@/features/familiars/model/familiar";
import { habitRunFamiliar, isHabitRun } from "@/features/familiars/model/familiar-habits";
import { NOTES_CHANGED_EVENT, upsertNote } from "@/features/notes/notes";
import { upsertSession } from "@/features/sessions/data/session-store";
import type { AgentAppDeps } from "./agent-app-deps";
import type { RequestSource } from "./agent-app-source";

export async function saveAppNote(note: Parameters<typeof upsertNote>[0]) {
  const saved = await upsertNote(note);
  window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
  return saved;
}

/** Posts an artifact's card on the request's turn (or the latest user turn) of the session. */
export async function postAppArtifact(
  deps: AgentAppDeps,
  request: RequestSource,
  sessionId: string,
  card: Parameters<typeof recordArtifactCard>[2],
): Promise<void> {
  const latest = deps.sessionsRef.current.find((session) => session.id === sessionId);
  const anchor =
    request.sourceTurnId ??
    latest?.blocks
      .slice()
      .reverse()
      .find((block) => block.role === "user")?.id;
  if (!latest || !anchor || !latest.blocks.some((block) => block.id === anchor))
    throw new Error("The artifact's conversation turn is no longer available");

  const updated: Session = recordArtifactCard(latest, anchor, card);
  deps.sessionsRef.current = deps.sessionsRef.current.map((session) => (session.id === sessionId ? updated : session));
  deps.setSessions(deps.sessionsRef.current);
  if (!isHabitRun(sessionId)) await upsertSession(updated);
}

/** The Familiar behind a session or a habit run, as the CLI describes it. */
export function familiarOfSession(id: string) {
  const familiar = familiarForSession(id) ?? findFamiliar(habitRunFamiliar(id) ?? "");
  return (
    familiar && {
      id: familiar.id,
      projects: familiar.projects,
      showStartedSessionsInSidebar: familiar.showStartedSessionsInSidebar,
      ...(familiar.useSidebarFolders
        ? { folder: { name: familiarLook(familiar).name, color: familiar.color } }
        : {}),
    }
  );
}
