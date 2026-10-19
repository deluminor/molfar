import { HARNESS_TITLE } from "@/domain/harness/harness";
import { supportsProviderAccounts } from "@/domain/harness/provider-account";
import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { remoteProjectFor } from "@/features/connections/model/remote-projects";
import { remoteSessionActions } from "@/features/connections/model/remote-session-actions";
import { isFamiliarSession } from "@/features/familiars/model/familiar";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { selectedProviderAccountId } from "@/features/providers/model/provider-accounts";
import { operatorEnabledInThread } from "@/features/sessions/model/operator-command";
import {
  applyHarnessEvent,
  canCompactHarnessContext,
  compactHarnessContext,
} from "@/integrations/harness";
import type { TurnControlDeps } from "./turn-control-deps";

/**
 * Asks the session's harness to compact its context. False when the session
 * cannot take it now (busy, removed worktree, unknown).
 */
export function compactContext(deps: TurnControlDeps, sessionId: string): boolean {
  const current = deps.sessions().find((session) => session.id === sessionId);
  if (current && remoteProjectFor(current.cwd))
    return remoteSessionActions(sessionId)?.compact() ?? false;
  if (!current || current.busy || current.worktreeRemoved) return false;

  if (!canCompactHarnessContext(current.harness)) {
    deps.commitSessions(
      deps.sessions().map((session) =>
        session.id === sessionId
          ? applyHarnessEvent(session, {
              type: "status",
              text: `${HARNESS_TITLE[current.harness]} does not support manual context compaction.`,
            })
          : session,
      ),
    );
    return true;
  }

  const gen = (deps.turnGen.get(sessionId) ?? 0) + 1;
  deps.turnGen.set(sessionId, gen);
  deps.commitSessions(
    deps.sessions().map((session) =>
      session.id === sessionId
        ? applyHarnessEvent(
            { ...session, busy: true },
            { type: "status", text: "Compacting context…" },
          )
        : session,
    ),
  );
  void runCompaction(deps, current, gen);
  return true;
}

async function runCompaction(
  deps: TurnControlDeps,
  current: Session,
  gen: number,
): Promise<void> {
  const sessionId = current.id;
  const isCurrent = () => deps.turnGen.get(sessionId) === gen;

  try {
    await compactHarnessContext({
      harness: current.harness,
      sessionId,
      cwd: sessionWorkCwd(current),
      model: current.model,
      modelSettings: current.modelSettings,
      providerAccountId: supportsProviderAccounts(current.harness)
        ? (current.providerAccountId ??
          selectedProviderAccountId(current.harness, current.cwd))
        : undefined,
      runtimeMode: current.runtimeMode,
      ephemeral: current.ephemeral === true,
      codexStore: isFamiliarSession(sessionId) ? "mono" : undefined,
      controlsAgents:
        isFamiliarSession(sessionId) ||
        operatorEnabledInThread(current.blocks) ||
        orchestrator.run(sessionId)?.status === "active",
      onEvent: (event) => {
        if (!isCurrent()) return;
        deps.enqueueHarnessEvent(sessionId, event);
      },
    });
    if (!isCurrent()) return;
    deps.enqueueHarnessEvent(sessionId, { type: "status", text: "Compacted context" });
  } catch (error: unknown) {
    if (!isCurrent()) return;
    deps.enqueueHarnessEvent(sessionId, {
      type: "session.error",
      message:
        error instanceof Error
          ? error.message
          : `${current.harness} could not compact this context`,
    });
  } finally {
    if (isCurrent()) {
      deps.flushHarnessEvents();
      deps.commitSessions(
        deps.sessions().map((session) =>
          session.id === sessionId ? { ...session, busy: false } : session,
        ),
      );
    }
  }
}
