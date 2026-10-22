import { sameProviderAccountId, supportsProviderAccounts } from "@/domain/harness/provider-account";
import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import {
  resumeFamiliarUsageLimit,
  switchFamiliarUsageLimitAccount,
} from "@/features/familiars/model/familiar-usage-limit";
import { providerAccountExists } from "@/features/providers/model/provider-accounts";
import { CONTINUE_PROMPT } from "@/features/sessions/model/in-flight";
import { withUsageLimitAccount } from "@/features/sessions/model/usage-limit";
import { transferHarnessSessionAccount } from "@/integrations/harness";
import { mapSession, type TurnQueueDeps } from "./turn-queue-deps";

/** Actions on a session stopped by its provider's usage limit. */
export function createUsageLimits(deps: TurnQueueDeps) {
  const switching = new Set<string>();
  const find = (sessionId: string) => deps.sessions().find((entry) => entry.id === sessionId);

  const dismiss = (sessionId: string): void => {
    deps.updateSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId && session.usageLimit
          ? { ...session, usageLimit: undefined }
          : session,
      ),
    );
  };

  const setResumeAtReset = (sessionId: string, enabled: boolean): void => {
    deps.updateSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId && session.usageLimit
          ? { ...session, usageLimit: { ...session.usageLimit, resumeAtReset: enabled } }
          : session,
      ),
    );
  };

  const resume = (sessionId: string): void => {
    const session = find(sessionId);
    if (!session?.usageLimit || session.busy) return;

    if (isFamiliarSession(sessionId)) {
      deps.updateSessions(mapSession(sessionId, resumeFamiliarUsageLimit));
      return;
    }
    dismiss(sessionId);
    deps.submit(sessionId, CONTINUE_PROMPT);
  };

  /**
   * Copies the native transcript so the other account resumes the very same
   * provider session. False when the user moved on while it was copied.
   */
  const carryTranscript = async (
    session: Session,
    native: { harness: "claude" | "codex"; providerSessionId: string },
    accountId: string,
  ): Promise<boolean | undefined> => {
    let carried = false;
    switching.add(session.id);
    try {
      await transferHarnessSessionAccount({
        ...native,
        threadId: session.id,
        cwd: sessionWorkCwd(session),
        fromAccountId: session.providerAccountId,
        toAccountId: accountId,
        blocks: session.blocks,
      });
      carried = true;
    } catch (error) {
      console.warn(
        "Could not carry the conversation to the other account; continuing from a handoff",
        error,
      );
    } finally {
      switching.delete(session.id);
    }

    const latest = find(session.id);
    if (
      !latest?.usageLimit ||
      latest.busy ||
      latest.providerSessionId !== session.providerSessionId ||
      !sameProviderAccountId(latest.providerAccountId, session.providerAccountId)
    )
      return undefined;
    return carried;
  };

  const changeAccount = async (sessionId: string, accountId: string): Promise<void> => {
    const session = find(sessionId);
    if (
      !session?.usageLimit ||
      session.busy ||
      !supportsProviderAccounts(session.harness) ||
      !providerAccountExists(session.harness, accountId) ||
      sameProviderAccountId(session.providerAccountId, accountId) ||
      switching.has(sessionId)
    )
      return;

    // Familiar Codex threads live in a private store, so they are not copied.
    const familiar = isFamiliarSession(sessionId);
    let carried = false;
    const { harness, providerSessionId } = session;
    if (providerSessionId && (harness === "claude" || (harness === "codex" && !familiar))) {
      const outcome = await carryTranscript(session, { harness, providerSessionId }, accountId);
      if (outcome === undefined) return;
      carried = outcome;
    }

    if (familiar) {
      deps.updateSessionsNow(
        mapSession(sessionId, (entry) => switchFamiliarUsageLimitAccount(entry, accountId, carried)),
      );
      return;
    }
    deps.updateSessionsNow(
      mapSession(sessionId, (entry) => withUsageLimitAccount(entry, accountId, carried)),
    );
    resume(sessionId);
  };

  return { dismiss, setResumeAtReset, resume, changeAccount };
}
