import type { Session } from "@/domain/session/session";
import { applyHarnessEvents } from "@/integrations/harness/core/apply";
import type { HarnessEvent } from "@/integrations/harness/core/types";
import {
  cancelScheduledFlush,
  type ScheduledFlush,
  scheduleHarnessFlush,
} from "./harness-flush";

export type HarnessEventPipelineDeps = {
  readSessions(): Session[];
  /** Publishes sessions that changed; only called when one did. */
  commitSessions(next: Session[]): void;
  isForeground(sessionId: string): boolean;
  schedule?: (run: () => void, foreground: boolean) => ScheduledFlush;
  cancel?: (handle: ScheduledFlush | null) => void;
};

export type HarnessEventPipeline = {
  enqueue(sessionId: string, event: HarnessEvent): void;
  /** Applies everything queued now. */
  flush(): void;
  dispose(): void;
};

/** A request or answer the user acts on must not wait for the next frame. */
function appliesAtOnce(event: HarnessEvent): boolean {
  return (
    event.type === "approval.requested" ||
    event.type === "approval.resolved" ||
    event.type === "question.asked" ||
    event.type === "question.resolved"
  );
}

/**
 * Tokens arrive many times per frame; queue them per session and apply each
 * batch once, so React and markdown are not recomputed for every delta.
 */
export function createHarnessEventPipeline(
  deps: HarnessEventPipelineDeps,
): HarnessEventPipeline {
  const schedule = deps.schedule ?? scheduleHarnessFlush;
  const cancel = deps.cancel ?? cancelScheduledFlush;
  let queued = new Map<string, HarnessEvent[]>();
  let pending: ScheduledFlush | null = null;

  const apply = (batches: ReadonlyMap<string, HarnessEvent[]>) => {
    const previous = deps.readSessions();
    const next = previous.map((session) => {
      const events = batches.get(session.id);
      return events ? applyHarnessEvents(session, events) : session;
    });
    if (next.some((session, index) => session !== previous[index])) {
      deps.commitSessions(next);
    }
  };

  const flush = () => {
    cancel(pending);
    pending = null;
    if (queued.size === 0) return;

    const batches = queued;
    queued = new Map();
    apply(batches);
  };

  const enqueue = (sessionId: string, event: HarnessEvent) => {
    if (appliesAtOnce(event)) {
      const events = [...(queued.get(sessionId) ?? []), event];
      queued.delete(sessionId);
      apply(new Map([[sessionId, events]]));
      return;
    }

    const events = queued.get(sessionId);
    if (events) events.push(event);
    else queued.set(sessionId, [event]);

    const foreground = deps.isForeground(sessionId);
    // A visible stream must not wait for a background-only timer.
    if (foreground && pending?.kind === "timeout") {
      cancel(pending);
      pending = null;
    }
    if (!pending) pending = schedule(flush, foreground);
  };

  const dispose = () => {
    cancel(pending);
    pending = null;
  };

  return { enqueue, flush, dispose };
}
