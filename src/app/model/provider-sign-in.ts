import { lastUserBlockId } from "@/domain/session/session-state";
import type { Session } from "@/domain/session/session";
import {
  latestTurnNeedsHarnessLogin,
  supportsHarnessLogin,
} from "@/integrations/harness/core/auth-support";
import type { ProviderSignInRequest } from "../workspace/store/shell-slice";

/** One sign-in prompt per turn that asked for it. */
export function providerSignInRequestKey(session: Session): string {
  const lastBlockId = session.blocks[session.blocks.length - 1]?.id;
  return `${session.id}:${lastUserBlockId(session) ?? lastBlockId ?? "auth"}`;
}

export function needsProviderSignIn(session: Session): boolean {
  return supportsHarnessLogin(session.harness) && latestTurnNeedsHarnessLogin(session.blocks);
}

export function providerSignInRequest(session: Session | undefined): ProviderSignInRequest | null {
  if (!session || !needsProviderSignIn(session)) return null;

  return { key: providerSignInRequestKey(session), sessionId: session.id, harness: session.harness };
}
