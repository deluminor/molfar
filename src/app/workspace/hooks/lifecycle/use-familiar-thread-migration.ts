import { useEffect } from "react";
import { sessionWorkCwd } from "@/domain/session/session-state";
import type { Session } from "@/domain/session/session";
import { listFamiliars } from "@/features/familiars/model/familiar";
import { getSession } from "@/features/sessions/data/session-store";
import { migrateFamiliarCodexSession } from "@/integrations/harness";

/** Migrates each saved Familiar's Codex threads (chat and side questions) whenever the roster changes. */
export function useFamiliarThreadMigration(
  familiarsSnap: string,
  sessionsRef: { readonly current: Session[] },
): void {
  useEffect(() => {
    let cancelled = false;
    // Retain known existing Familiar threads before hiding their original entries.
    // Sending a turn uses the same migration lock, so it can safely overlap.
    void (async () => {
      for (const mono of listFamiliars()) {
        if (cancelled) return;
        if (!mono.sessionId) continue;
        try {
          const session =
            sessionsRef.current.find((s) => s.id === mono.sessionId) ??
            (await getSession(mono.sessionId));
          if (
            !session ||
            cancelled ||
            sessionsRef.current.find((s) => s.id === session.id)?.busy
          )
            continue;
          const cwd = sessionWorkCwd(session);
          if (!cwd || cwd === "~") continue;
          const threadIds = new Set<string>();
          if (session.harness === "codex" && session.providerSessionId)
            threadIds.add(session.providerSessionId);
          for (const block of session.blocks) {
            for (const thread of block.btwThreads ?? []) {
              if (
                (thread.harness ?? session.harness) === "codex" &&
                thread.providerThreadId
              )
                threadIds.add(thread.providerThreadId);
            }
          }
          for (const threadId of threadIds) {
            if (cancelled) return;
            await migrateFamiliarCodexSession({
              sessionId: session.id,
              threadId,
              cwd,
              providerAccountId: session.providerAccountId,
            });
          }
        } catch (error) {
          // Keep the original context intact; the next native operation retries.
          console.warn("Could not migrate saved Familiar Codex context", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [familiarsSnap, sessionsRef]);
}
