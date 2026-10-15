import type { ControlOutcome } from "../../features/orchestration/model/orchestration";
import { pendingApprovalForSession } from "../../features/notifications/model/approvalToast";
import type { QuickLaunch } from "../../features/quick-composer/model/quickComposer";
import type { Session } from "../../features/sessions/model/session";
import { lastTurnAssistantText } from "../../features/sessions/model/turn-text";
import type { SessionPort, StageLaunch } from "../../features/task-board/services/ports";

const SETTLE_POLL_MS = 50;
const SETTLE_POLL_LIMIT = 40;

export type TaskBoardSessionDeps = {
  /** App's quick-launch path: hidden session, no tab, settlement callback. */
  launch: (launch: QuickLaunch, sessionId: string, onSettled: (outcome: ControlOutcome) => void) => Promise<void>;
  sessions: () => readonly Session[];
  loadSession: (sessionId: string) => Promise<Session | null>;
  stop: (sessionId: string) => Promise<void>;
  wait: (ms: number) => Promise<void>;
};

/**
 * The settlement fires before React commits the final blocks, and an idle
 * hidden session is detached shortly after. Wait for the live copy to go idle;
 * fall back to the persisted transcript once it is gone.
 */
async function settledText(deps: TaskBoardSessionDeps, sessionId: string): Promise<string> {
  for (let attempt = 0; attempt < SETTLE_POLL_LIMIT; attempt++) {
    const live = deps.sessions().find((session) => session.id === sessionId);
    if (!live) break;
    if (!live.busy) return lastTurnAssistantText(live.blocks);
    await deps.wait(SETTLE_POLL_MS);
  }
  const stored = await deps.loadSession(sessionId);
  return stored ? lastTurnAssistantText(stored.blocks) : "";
}

function quickLaunch(launch: StageLaunch, prompt: string): QuickLaunch {
  return {
    sidebarHidden: true,
    taskCardId: launch.cardId,
    prompt,
    cwd: launch.projectCwd,
    worktreeCwd: launch.cwd,
    harness: launch.choice.harness,
    model: launch.choice.model,
    modelSettings: launch.choice.modelSettings,
    runtimeMode: launch.choice.runtimeMode,
    reveal: false,
  };
}

export function createTaskBoardSessionPort(deps: TaskBoardSessionDeps): SessionPort {
  const find = (sessionId: string) => deps.sessions().find((session) => session.id === sessionId);

  return {
    async launch(launch, prompt, onSettled) {
      const { sessionId } = launch;
      let settled = false;
      const settle = (outcome: ControlOutcome) => {
        settled = true;
        void settledText(deps, sessionId)
          .catch((error: unknown) => {
            console.error("Task board: could not read the stage transcript", { sessionId, error });
            return "";
          })
          .then((text) => onSettled({ ...outcome, text: text || outcome.text }));
      };

      try {
        await deps.launch(quickLaunch(launch, prompt), sessionId, settle);
      } catch (error: unknown) {
        // A rejected submission already reported itself through `settle`.
        if (!settled) throw error;
      }
    },
    state(sessionId) {
      const session = find(sessionId);
      if (!session) return "missing";
      return session.busy ? "busy" : "idle";
    },
    turnText(sessionId) {
      const session = find(sessionId);
      return session ? lastTurnAssistantText(session.blocks) : "";
    },
    needsInput(sessionId) {
      const session = find(sessionId);
      return !!session && pendingApprovalForSession(session) !== null;
    },
    stop: (sessionId) => deps.stop(sessionId),
  };
}
