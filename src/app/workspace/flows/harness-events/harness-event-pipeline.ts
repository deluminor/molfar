import type { Session } from "@/domain/session/session";
import { applyHarnessEvents } from "@/integrations/harness/core/apply";
import type { HarnessEvent } from "@/integrations/harness/core/types";
import { HarnessEventQueue } from "./harness-flush";

export type HarnessEventPipelineDeps = {
  /** Applies `update` to the latest sessions; it returns them unchanged when nothing changed. */
  updateSessions(update: (sessions: Session[]) => Session[]): void;
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
export function createHarnessEventPipeline(
  deps: HarnessEventPipelineDeps,
): HarnessEventPipeline {
  const queue = new HarnessEventQueue(deps.isForeground, (batches) => {
    deps.updateSessions((current) => {
      const updated = current.map((session) => {
        const events = batches.get(session.id);
        return events ? applyHarnessEvents(session, events) : session;
      });
      return updated.some((session, index) => session !== current[index])
        ? updated
        : current;
    });
  });

  return {
    enqueue: queue.enqueue,
    flush: queue.flush,
    flushForeground: queue.flushForeground,
    isForeground: queue.isForeground,
    dispose: queue.cancelScheduled,
  };
}
