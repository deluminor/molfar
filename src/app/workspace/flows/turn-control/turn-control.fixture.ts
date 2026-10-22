import { vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import type { TurnControlDeps } from "./turn-control-deps";

/** Open sessions behind turn-control deps, starting with session `s`. */
export function setupTurnControl(patch: Partial<Session> = {}) {
  let open: Session[] = [{ ...testSession("claude", "/work/demo"), id: "s", ...patch }];
  const deps: TurnControlDeps = {
    sessions: () => open,
    commitSessions: (next) => {
      open = next;
    },
    updateSessions: (update) => {
      open = update(open);
    },
    turnGen: new Map(),
    enqueueHarnessEvent: vi.fn(),
    flushHarnessEvents: vi.fn(),
  };

  return { deps, session: (): Session => open[0] };
}
