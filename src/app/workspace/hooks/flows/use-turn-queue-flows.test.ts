import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import type { TabVisits } from "../../flows/tabs/tab-visits";
import { fakeFlowCore } from "./flow-core.fixture";
import { createSessionOpenerFlows } from "./use-session-opener-flows";
import { createTabFlows } from "./use-tab-flows";
import { createTurnQueueFlows } from "./use-turn-queue-flows";

function session(id: string, patch: Partial<Session> = {}): Session {
  return { ...testSession("claude", "/work/demo"), id, ...patch };
}

function setup(open: Session[], activeSessionId?: string) {
  const core = fakeFlowCore();
  core.sessionsRef.current = open;
  const tabFlows = createTabFlows(core, {
    terminalCwdRef: { current: "~" },
    displayedTabNavigation: { current: { tabs: [], activeId: "" } },
  });
  const { place } = createSessionOpenerFlows(core, {
    tabFlows,
    visits: {} as TabVisits,
    linkedUpdateCards: { reveal: vi.fn() },
    linkedUpdatesRef: { current: new Map() },
    navigationIdsRef: { current: [] },
    deckTabsRef: { current: [] },
  });
  const send = vi.fn(() => true);
  const flows = createTurnQueueFlows(core, {
    enqueueHarnessEvent: vi.fn(),
    flushHarnessEvents: vi.fn(),
    tabFlows,
    place,
    submission: { send },
    activeSessionId: () => activeSessionId,
  });

  return { core, flows, send };
}

describe("createTurnQueueFlows", () => {
  it("submits queued turns through the submission and writes sessions through the Workspace", () => {
    const { core, flows, send } = setup([session("s")]);

    flows.turnQueue.updateSessionsNow((prev) => prev.map((entry) => ({ ...entry, title: "Now" })));

    expect(flows.turnQueue.submit).toBe(send);
    expect(core.sessionsRef.current[0]?.title).toBe("Now");
  });

  it("re-pins a blank session to the selected account for the session read at call time", () => {
    const { core, flows } = setup([session("s")], "s");

    flows.providerAccounts.select("claude", "work");

    expect(core.sessionsRef.current[0]?.providerAccountId).toBe("work");
  });

  it("dismisses a composer card through the Workspace's sessions", () => {
    const { core, flows } = setup([session("s", { noteCard: { id: "n" } as Session["noteCard"] })]);

    flows.composerCards.dismissNote("s");

    expect(core.setSessions).toHaveBeenCalledOnce();
    expect(core.sessionsRef.current[0]?.noteCard).toBeUndefined();
  });
});
