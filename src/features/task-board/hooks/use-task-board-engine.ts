import { useEffect, useMemo } from "react";
import { taskGitClient } from "../api/git-client";
import { onTaskBoardChanged, taskBoardClient } from "../api/task-board-client";
import { ENGINE_TICK_MS } from "../constants/limits";
import type { Card } from "../types/card";
import { runAction, type OwnerAction } from "../services/actions";
import { createCard, type NewCard } from "../services/card-create";
import { TaskBoardEngine } from "../services/engine";
import { systemBoardNotifier } from "../services/notify";
import type { EnginePorts, SessionPort } from "../services/ports";

/** What the board UI and the companion gateway use to act on cards. */
export type TaskBoardRuntime = {
  ports: EnginePorts;
  create(input: NewCard): Promise<Card>;
  act(cardId: string, action: OwnerAction): Promise<Card>;
  needsInput(sessionId: string): boolean;
};

/**
 * Mounts the engine. Only the main window may enable it: reconcile judges runs
 * by the sessions loaded in its own window. It ticks on board changes, on a
 * slow interval for stall checks, and after every user action.
 */
export function useTaskBoardEngine(
  sessions: SessionPort,
  enabled: boolean,
  projects: () => readonly string[],
): TaskBoardRuntime {
  const ports = useMemo<EnginePorts>(
    () => ({
      projects,
      store: taskBoardClient,
      git: taskGitClient,
      sessions,
      notify: systemBoardNotifier,
      now: () => Date.now(),
      newId: () => crypto.randomUUID(),
    }),
    [sessions, projects],
  );
  const engine = useMemo(() => new TaskBoardEngine(ports), [ports]);

  useEffect(() => {
    if (!enabled) return;
    engine.resume();
    const tick = () => void engine.tick();
    tick();
    const interval = window.setInterval(tick, ENGINE_TICK_MS);
    const unlisten = onTaskBoardChanged(tick);
    return () => {
      window.clearInterval(interval);
      unlisten();
      engine.stop();
    };
  }, [engine, enabled]);

  return useMemo<TaskBoardRuntime>(
    () => ({
      ports,
      create: (input) => createCard(ports, input),
      act: async (cardId, action) => {
        const card = await runAction(ports, cardId, action);
        if (enabled) void engine.tick();
        return card;
      },
      needsInput: (sessionId) => ports.sessions.needsInput(sessionId),
    }),
    [ports, engine, enabled],
  );
}
