import { type Session } from "@/domain/session/session";
import { sameProviderAccountId } from "@/domain/harness/provider-account";
import { CONTINUE_PROMPT } from "@/features/sessions/model/in-flight";
import {
  resumeUsageLimitedSession,
  withUsageLimitAccount,
} from "@/features/sessions/model/usage-limit";
import { enqueueFamiliarMessage } from "./familiar-messaging";

/** Retry the existing outbox in order, or continue the stopped work once. */
export function resumeFamiliarUsageLimit(session: Session): Session {
  if (!session.usageLimit || session.busy) return session;
  const resumed = resumeUsageLimitedSession(session);
  return resumed.queuedMessages?.length
    ? resumed
    : enqueueFamiliarMessage(resumed, {
        id: crypto.randomUUID(),
        text: CONTINUE_PROMPT,
        attachments: [],
      });
}

/** Continue under another account, carrying the native transcript when it
 * was copied there, otherwise through a transcript handoff. */
export function switchFamiliarUsageLimitAccount(
  session: Session,
  accountId: string,
  carried = false,
): Session {
  if (
    !session.usageLimit ||
    session.busy ||
    sameProviderAccountId(session.providerAccountId, accountId)
  )
    return session;
  return resumeFamiliarUsageLimit(
    withUsageLimitAccount(session, accountId, carried),
  );
}
