import { vi } from "vitest";
import type { QueuedMessage } from "@/domain/session/message-queue";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import type { TurnQueueDeps } from "./turn-queue-deps";

export const queued = (id: string, text = id): QueuedMessage => ({ id, text, attachments: [] });

/** Open sessions behind turn-queue deps, starting with session `s`. */
export function setupTurnQueue(patch: Partial<Session> = {}) {
  let open: Session[] = [{ ...testSession("claude", "/work/demo"), id: "s", ...patch }];
  const update = (next: (prev: Session[]) => Session[]) => {
    open = next(open);
  };
  const deps = {
    sessions: () => open,
    updateSessions: update,
    updateSessionsNow: update,
    submit: vi.fn((..._args: Parameters<TurnQueueDeps["submit"]>) => true),
    enqueueHarnessEvent: vi.fn(),
    flushHarnessEvents: vi.fn(),
  } satisfies TurnQueueDeps;

  return { deps, session: (): Session => open[0] };
}
