import { describe, expect, it, vi } from "vitest";
import type { Submit } from "../submission/submit-types";
import { canSendQueuedHead, dispatchQueuedHead } from "./queue-dispatch";
import { queued, setupTurnQueue } from "./turn-queue.fixture";

function setup(submitSession: Submit, patch = {}) {
  const { deps, session } = setupTurnQueue({ queuedMessages: [queued("q", "next")], ...patch });
  const dispatching = new Set(["s"]);
  const redispatch = vi.fn();
  return { deps: { ...deps, submitSession, dispatching, redispatch }, session };
}

describe("queue dispatch", () => {
  it("holds the head of a busy session that is not a Familiar", () => {
    const { session } = setup(vi.fn());

    expect(canSendQueuedHead({ ...session(), busy: true }, queued("q"))).toBe(false);
    expect(canSendQueuedHead(session(), queued("q"))).toBe(true);
  });

  it("sends the head and looks at the queues again once accepted", async () => {
    const submitSession = vi.fn<Submit>(() => true);
    const { deps } = setup(submitSession);

    await dispatchQueuedHead(deps, "s", "q");

    expect(submitSession).toHaveBeenCalledWith("s", "next", [], expect.objectContaining({ queuedMessageId: "q" }));
    expect(deps.redispatch).toHaveBeenCalled();
    expect(deps.dispatching.has("s")).toBe(false);
  });

  it("skips a head that changed while the dispatch waited", async () => {
    const submitSession = vi.fn<Submit>(() => true);
    const { deps } = setup(submitSession);

    await dispatchQueuedHead(deps, "s", "other");

    expect(submitSession).not.toHaveBeenCalled();
    expect(deps.dispatching.has("s")).toBe(false);
  });

  it("pauses the queue with the error when sending throws", async () => {
    const { deps, session } = setup(vi.fn<Submit>(() => Promise.reject(new Error("offline"))));

    await dispatchQueuedHead(deps, "s", "q");

    expect(session().queueStatus).toBe("paused");
    expect(session().queuedMessages?.[0].error).toBe("offline");
    expect(deps.redispatch).not.toHaveBeenCalled();
  });
});
