import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@/domain/session/session";

export type ComposerCardKey = "inboxCard" | "noteCard" | "handoffCard";

/** Takes a card (inbox item, note, handoff) off the session's composer. */
export function dismissComposerCard(
  setSessions: Dispatch<SetStateAction<Session[]>>,
  sessionId: string,
  key: ComposerCardKey,
): void {
  setSessions((prev) =>
    prev.map((session) =>
      session.id === sessionId && session[key] ? { ...session, [key]: undefined } : session,
    ),
  );
}
