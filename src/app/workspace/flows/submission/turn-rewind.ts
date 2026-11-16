import { isFamiliarSession } from "@/features/familiars/model/familiar";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import {
  canRewindHarnessLastTurn,
  forgetHarnessSession,
  rewindHarnessLastTurn,
} from "@/integrations/harness";
import type { TurnEvents } from "./turn-events";
import type { TurnContext } from "./turn-run";

/**
 * Rewinds the provider's last turn before its edited version is resent.
 * False when the turn was superseded meanwhile; the edit is then recovered.
 */
export async function rewindEditedTurn(context: TurnContext, events: TurnEvents): Promise<boolean> {
  const { deps, turn, run } = context;
  const { sessionId, current, editedResend } = turn;
  if (!editedResend || !canRewindHarnessLastTurn(current.harness)) return true;

  try {
    await rewindHarnessLastTurn({
      harness: current.harness,
      sessionId,
      cwd: run.workCwd,
      model: current.model,
      modelSettings: current.modelSettings,
      providerAccountId: turn.providerAccountId,
      runtimeMode: current.runtimeMode,
      ephemeral: current.ephemeral === true,
      codexStore: isFamiliarSession(sessionId) ? "mono" : undefined,
      controlsAgents: turn.operatorAccess || orchestrator.run(sessionId)?.status === "active",
      ...(turn.editedProviderTurnId ? { providerTurnId: turn.editedProviderTurnId } : {}),
      onEvent: (event) => {
        if (!context.isCurrent()) return;
        deps.enqueueHarnessEvent(sessionId, event);
      },
    });
  } catch (error) {
    deps.flushHarnessEvents();
    editedResend.reject();
    throw error;
  }
  editedResend.markProviderRewound();
  deps.flushHarnessEvents();
  if (context.isCurrent()) return true;

  const latest = deps.sessionsRef.current.find((session) => session.id === sessionId);
  if (!latest || (!latest.busy && latest.providerSessionId === current.providerSessionId)) {
    await forgetHarnessSession(current.harness, sessionId);
    if (latest) {
      deps.setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId && session.providerSessionId === current.providerSessionId
            ? { ...session, providerSessionId: undefined }
            : session,
        ),
      );
    }
  }
  events.recoverEditedResend();
  return false;
}
