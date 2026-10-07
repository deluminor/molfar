import { CONTINUE_PROMPT } from "../../sessions/model/inFlight";
import type { Session } from "../../sessions/model/session";
import { sameProviderAccountId } from "../../providers/model/providerAccounts";
import { resumeUsageLimitedSession } from "../../sessions/model/usageLimit";
import { enqueueFamiliarMessage } from "./familiarMessaging";

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

/** Account-owned threads need a fresh connection with a transcript handoff. */
export function switchFamiliarUsageLimitAccount(
  session: Session,
  accountId: string,
): Session {
  if (
    !session.usageLimit ||
    session.busy ||
    sameProviderAccountId(session.providerAccountId, accountId)
  )
    return session;
  return resumeFamiliarUsageLimit({
    ...session,
    providerAccountId: accountId,
    providerSessionId: undefined,
    pendingSwitch: {
      ...(session.pendingSwitch ?? {
        from: session.harness,
        fromModel: session.model,
        fromSettings: session.modelSettings,
        fromProviderSessionId: session.providerSessionId,
        fromProviderAccountId: session.providerAccountId,
      }),
      skipOutgoingRecap: true,
    },
  });
}
