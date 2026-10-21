import { useEffect, useMemo, useState } from "react";
import type { Session } from "@/domain/session/session";
import {
  needsProviderSignIn,
  providerSignInRequest,
  providerSignInRequestKey,
} from "../../model/provider-sign-in";
import type { WorkspaceStore } from "../store/types";
import { useWorkspaceActions } from "./use-workspace-actions";
import { useWorkspaceField } from "./use-workspace-field";

/**
 * Prompts sign-in once for each turn of the active session that needs it,
 * skipping turns that already needed it when the window opened, and drops
 * the prompt when another session becomes active.
 */
export function useProviderSignInPrompt(
  store: WorkspaceStore,
  sessions: readonly Session[],
  active: Session | undefined,
): void {
  const shown = useWorkspaceField(store, "providerSignInRequest");
  const { setProviderSignInRequest } = useWorkspaceActions(store);
  const [seen] = useState(
    () => new Set(sessions.filter(needsProviderSignIn).map(providerSignInRequestKey)),
  );
  const request = useMemo(() => providerSignInRequest(active), [active]);

  useEffect(() => {
    if (!request || seen.has(request.key)) return;
    seen.add(request.key);
    setProviderSignInRequest(request);
  }, [request, seen]);

  useEffect(() => {
    if (shown && active?.id !== shown.sessionId) setProviderSignInRequest(null);
  }, [active?.id, shown]);
}
