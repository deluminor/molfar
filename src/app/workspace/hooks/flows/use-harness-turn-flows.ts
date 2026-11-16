import type { Session } from "@/domain/session/session";
import { sessionWorkCwd } from "@/domain/session/session-state";
import { syncDockBadge } from "@/features/notifications/model/dock-badge";
import { orchestrator } from "@/features/orchestration/model/orchestration";
import { finishSessionTurn } from "@/features/sessions/model/checkpoint";
import { sessionChildHarnesses } from "@/features/sessions/model/handoff";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { cancelHarnessTurn, stopHarnessSession } from "@/integrations/harness";
import { isForegroundSession } from "../../flows/harness-events/foreground-session";
import type { ForegroundSurface } from "../../flows/harness-events/foreground-surface";
import { createHarnessEventPipeline } from "../../flows/harness-events/harness-event-pipeline";
import type { HarnessReplyDeps } from "../../flows/turn-control/harness-replies";
import { createTurnControlActions } from "../../flows/turn-control/turn-control-actions";
import type { TurnControlDeps } from "../../flows/turn-control/turn-control-deps";
import { useStableFlow } from "../use-stable-flow";
import type { WorkspaceSessions } from "../use-workspace-sessions";

export type HarnessTurnFlowsInput = {
  sessionsRef: WorkspaceSessions["sessionsRef"];
  sessionState: Pick<WorkspaceSessions["sessionState"], "update">;
  setSessions: WorkspaceSessions["setSessions"];
  tabsRef: { readonly current: WorkspaceTab[] };
  activeTabIdRef: { readonly current: string };
  foregroundSurfaceRef: { readonly current: ForegroundSurface };
  turnGen: { readonly current: Map<string, number> };
  /** Read lazily: the Familiar chat flows are built later in the render. */
  decideFamiliarApproval: HarnessReplyDeps["decideFamiliarApproval"];
};

export function createHarnessTurnFlows({
  sessionsRef,
  sessionState,
  setSessions,
  tabsRef,
  activeTabIdRef,
  foregroundSurfaceRef,
  turnGen,
  decideFamiliarApproval,
}: HarnessTurnFlowsInput) {
  // Visible output advances per frame; hidden streams keep their own cadence.
  const harnessEvents = createHarnessEventPipeline({
    updateSessions: (update, textOnly) => {
      const previous = sessionsRef.current;
      const next = sessionState.update(update, textOnly);
      if (!textOnly && next !== previous) syncDockBadge(next);
    },
    isForeground: (sessionId) =>
      isForegroundSession(sessionId, {
        hidden: false,
        ...foregroundSurfaceRef.current,
        activeTab: tabsRef.current.find(
          (entry) => entry.id === activeTabIdRef.current,
        ),
      }),
  });
  const flushHarnessEvents = harnessEvents.flush;

  const turnControl: TurnControlDeps = {
    sessions: () => sessionsRef.current,
    commitSessions: (next) => {
      sessionsRef.current = next;
      syncDockBadge(next);
      setSessions(next);
    },
    updateSessions: (update) => setSessions(update),
    turnGen: turnGen.current,
    enqueueHarnessEvent: harnessEvents.enqueue,
    flushHarnessEvents,
  };
  const harnessReplyDeps: HarnessReplyDeps = {
    sessions: () => sessionsRef.current,
    decideFamiliarApproval,
  };
  const turnActions = createTurnControlActions({ control: turnControl, reply: harnessReplyDeps });

  const stopSessionForRemoval = async (sessionId: string): Promise<Session | undefined> => {
    await orchestrator.stopForSession(sessionId);
    const open = sessionsRef.current.find(
      (session) => session.id === sessionId,
    );
    if (!open?.busy) return open;

    turnGen.current.set(sessionId, (turnGen.current.get(sessionId) ?? 0) + 1);
    flushHarnessEvents();
    await Promise.all(
      sessionChildHarnesses(open).map(async (harness) => {
        await cancelHarnessTurn(harness, sessionId).catch(() => undefined);
        await stopHarnessSession(harness, sessionId);
      }),
    );
    await finishSessionTurn(sessionId, sessionWorkCwd(open));
    flushHarnessEvents();
    return sessionsRef.current.find((session) => session.id === sessionId);
  };

  return { harnessEvents, turnControl, turnActions, stopSessionForRemoval };
}

/** The harness event pipeline, turn control and the stop used before a chat is removed; built once. */
export function useHarnessTurnFlows(input: HarnessTurnFlowsInput): ReturnType<typeof createHarnessTurnFlows> {
  return useStableFlow(() => createHarnessTurnFlows(input));
}
