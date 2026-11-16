import type { Session } from "@/domain/session/session";
import { noteStreamApplied } from "@/features/sessions/model/streaming-performance";
import { applyHarnessEvents } from "@/integrations/harness/core/apply";
import type { HarnessEvent } from "@/integrations/harness/core/types";
import { HarnessEventQueue } from "./harness-flush";

export type HarnessEventPipelineDeps = {
  /**
   * Applies `update` to the latest sessions; it returns them unchanged when nothing changed.
   * `textOnly` batches carry only message/reasoning deltas, so the shell need not re-render.
   */
  updateSessions(update: (sessions: Session[]) => Session[], textOnly: boolean): void;
  /** Whether the conversation is on screen; idle parking reads it too. */
  isForeground(sessionId: string): boolean;
};

export type HarnessEventPipeline = {
  enqueue(sessionId: string, event: HarnessEvent): void;
  /** Applies everything queued now. */
  flush(): void;
  /** Applies what visible panes queued, leaving hidden streams on their cadence. */
  flushForeground(): void;
  isForeground(sessionId: string): boolean;
  dispose(): void;
};

/**
 * Tokens arrive many times per frame; queue them per session and apply each
 * batch once, so React and markdown are not recomputed for every delta.
 * Visible output advances per frame; hidden streams keep their own cadence.
 */
function isTextDelta(event: HarnessEvent): boolean {
  return event.type === "message.delta" || event.type === "reasoning.delta";
}

export function createHarnessEventPipeline(
  deps: HarnessEventPipelineDeps,
): HarnessEventPipeline {
  const queue = new HarnessEventQueue(deps.isForeground, (batches) => {
    const textOnly = [...batches.values()].every((events) => events.every(isTextDelta));

    deps.updateSessions((current) => {
      const updated = current.map((session) => {
        const events = batches.get(session.id);
        if (!events) return session;
        const next = applyHarnessEvents(session, events);
        noteStreamApplied(session.blocks, next.blocks, events, queue.isForeground(session.id));
        return next;
      });
      return updated.some((session, index) => session !== current[index])
        ? updated
        : current;
    }, textOnly);
  });

  return {
    enqueue: queue.enqueue,
    flush: queue.flush,
    flushForeground: queue.flushForeground,
    isForeground: queue.isForeground,
    dispose: queue.cancelScheduled,
  };
}
