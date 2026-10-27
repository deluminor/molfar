import {
  listFamiliars,
  familiarLook,
} from "@/features/familiars/model/familiar";
import { getSession } from "@/features/sessions/data/session-store";
import type { Session } from "@/domain/session/session";
import { mobileTranscript } from "./mobile-transcript";

export function mobileMessages(session: Session) {
  return session.blocks
    .filter(
      (block) =>
        (block.role === "user" || block.role === "assistant") &&
        !block.internal &&
        !block.draft,
    )
    .slice(-200)
    .map((block) => ({ id: block.id, role: block.role, text: block.text }));
}
/**
 * A conversation as the phone shows it. A session the desktop does not have
 * open is read from disk once into `saved` and reused from there: it cannot
 * change until it opens, and then the live copy wins.
 */
export async function mobileConversation(
  id: string,
  live: readonly Session[],
  saved?: Map<string, Session>,
  range?: (turnIds: string[]) => [number, number],
) {
  const familiar = id.startsWith("familiar:")
    ? listFamiliars().find((familiar) => familiar.id === id.slice(5))
    : undefined;
  if (id.startsWith("familiar:") && !familiar)
    throw new Error("Familiar is no longer available");
  const sessionId = familiar ? familiar.sessionId : id;
  const session = sessionId
    ? (live.find((session) => session.id === sessionId) ??
      (await readSaved(sessionId, saved)))
    : undefined;
  return {
    id,
    messages: session ? mobileMessages(session) : [],
    turns: session
      ? mobileTranscript(session, {
          busy: !!session.busy,
          familiar: familiar
            ? { name: familiarLook(familiar).name }
            : undefined,
          pendingQuestion: !!session.pendingQuestion,
          backgroundTasks: session.backgroundTasks,
          range,
        })
      : [],
    busy: !!session?.busy,
  };
}

export async function readSaved(
  sessionId: string,
  saved?: Map<string, Session>,
) {
  const cached = saved?.get(sessionId);
  if (cached) return cached;
  const session = await getSession(sessionId);
  if (session) saved?.set(sessionId, session);
  return session;
}
