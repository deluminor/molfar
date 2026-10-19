import { useEffect } from "react";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import {
  deferUnhandledEscape,
  focusedBusyAgentSessionId,
  shouldStopFocusedTurnOnEscape,
} from "@/features/workspace/model/tab-keys";
import type { WorkspaceStore } from "../store/types";

export type EscapeStopDeps = {
  store: WorkspaceStore;
  sessions(): Session[];
  tabs(): WorkspaceTab[];
  activeTabId(): string;
  terminalFocused(): boolean;
  stop(sessionId: string): unknown;
};

function focusedBusySessionId(deps: EscapeStopDeps): string | null | undefined {
  const agentId = deps.store.getState().familiarViewId;
  if (agentId) {
    return deps.sessions().find((session) => session.id === agentId)?.busy
      ? agentId
      : undefined;
  }
  return focusedBusyAgentSessionId(
    deps.activeTabId(),
    deps.tabs(),
    deps.sessions(),
    deps.terminalFocused(),
  );
}

/** Escape outside a terminal stops the focused session's running turn. */
export function useEscapeStop(deps: EscapeStopDeps): void {
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const inTerminal = Boolean(target?.closest(".molfar-terminal"));
      const activeTabId = deps.activeTabId();
      const sessionId = focusedBusySessionId(deps);
      if (
        !sessionId ||
        !shouldStopFocusedTurnOnEscape(event, { inTerminal, focusedSessionBusy: true })
      ) {
        return;
      }

      // Other surfaces (drag/reorder included) can claim Escape later in the
      // same keydown dispatch. Defer the destructive stop until every handler
      // has had a chance to preventDefault, then verify focus did not move.
      deferUnhandledEscape(event, () => {
        if (deps.activeTabId() !== activeTabId || focusedBusySessionId(deps) !== sessionId) {
          return;
        }
        deps.stop(sessionId);
      });
    };

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [deps]);
}
