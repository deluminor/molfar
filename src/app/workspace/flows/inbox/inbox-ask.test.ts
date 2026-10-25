import { describe, expect, it, vi } from "vitest";
import { issue, setupInbox } from "./inbox.fixture";
import { createInboxAsk } from "./inbox-ask";

vi.mock("@/features/sessions/data/session-store", () => ({ deleteSession: vi.fn(async () => undefined) }));
vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  forgetHarnessSession: vi.fn(async () => undefined),
}));

function setupAsk() {
  const inbox = setupInbox([]);
  const ask = createInboxAsk({
    ...inbox.deps,
    removingSessionIds: { current: new Set() },
    stopSessionForRemoval: vi.fn(async () => undefined),
  });
  return { ...inbox, ask };
}

describe("createInboxAsk", () => {
  it("opens one ask chat per item, even when asked twice at once", async () => {
    const { ask, sessions } = setupAsk();

    const [first, second] = await Promise.all([ask.ask(issue), ask.ask(issue)]);

    expect(first).toBe(second);
    expect(sessions()).toHaveLength(1);
    expect(sessions()[0]).toMatchObject({ title: "Ask · Login fails", cwd: "/work/demo" });
    expect(await ask.ask(issue)).toBe(first);
  });

  it("restarts the ask chat under a new id and moves the portal to it", async () => {
    const { ask, sessions, store } = setupAsk();
    const id = await ask.ask(issue);
    store.getState().setInboxAskPortal({ sessionId: id } as never);

    const fresh = await ask.restart(issue);

    expect(fresh).not.toBe(id);
    expect(sessions().map((session) => session.id)).toEqual([fresh]);
    expect(sessions()[0].inboxAsk?.title).toBe("Login fails");
    expect(store.getState().inboxAskPortal).toMatchObject({ sessionId: fresh });
  });
});
