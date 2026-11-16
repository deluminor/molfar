import { useEffect } from "react";
import type { Session } from "@/domain/session/session";
import { CONTINUE_PROMPT, canAutoContinue } from "@/features/sessions/model/in-flight";
import { isLiveHarness } from "@/integrations/harness";

function continuable(session: Session): boolean {
  return canAutoContinue(session) && isLiveHarness(session.harness);
}

/** Resumes turns a reload interrupted by sending Continue to their sessions. */
export function useAutoContinue(
  sessions: Session[],
  openSessions: () => Session[],
  submit: (sessionId: string, text: string) => unknown,
): void {
  const autoContinueKey = sessions
    .filter(continuable)
    .map((session) => session.id)
    .join("\n");

  useEffect(() => {
    if (!autoContinueKey) return;
    const ids = autoContinueKey.split("\n");
    // Delay past React StrictMode's dev remount so Continue is not claimed
    // against a discarded tree (sessionStorage also survives Vite reloads).
    const timer = window.setTimeout(() => {
      for (const id of ids) {
        const session = openSessions().find((entry) => entry.id === id);
        if (session && continuable(session)) submit(id, CONTINUE_PROMPT);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoContinueKey, openSessions, submit]);
}
