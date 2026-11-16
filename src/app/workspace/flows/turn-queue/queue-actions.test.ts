import { describe, expect, it } from "vitest";
import { CONTINUE_PROMPT } from "@/features/sessions/model/in-flight";
import {
  editQueuedMessage,
  removeQueuedMessage,
  resumeQueue,
  steerQueuedMessage,
} from "./queue-actions";
import { queued, setupTurnQueue } from "./turn-queue.fixture";

describe("queue actions", () => {
  it("edits a queued message, clearing its error and the editing state", () => {
    const { deps, session } = setupTurnQueue({
      queuedMessages: [{ ...queued("q"), error: "failed" }],
      editingQueuedMessageId: "q",
    });

    editQueuedMessage(deps, "s", "q", "rewritten");

    expect(session().queuedMessages?.[0]).toMatchObject({ text: "rewritten", error: undefined });
    expect(session().editingQueuedMessageId).toBeUndefined();
  });

  it("removes a queued message", () => {
    const { deps, session } = setupTurnQueue({ queuedMessages: [queued("a"), queued("b")] });

    removeQueuedMessage(deps, "s", "a");

    expect(session().queuedMessages?.map((message) => message.id)).toEqual(["b"]);
  });

  it("steers a queued message into the running turn", () => {
    const { deps } = setupTurnQueue({ busy: true, queuedMessages: [queued("q", "faster")] });

    steerQueuedMessage(deps, "s", "q");

    expect(deps.submit).toHaveBeenCalledWith(
      "s",
      "faster",
      [],
      expect.objectContaining({ followUpBehavior: "steer", queuedMessageId: "q" }),
    );
  });

  it("holds a queued orchestration until the running turn ends", () => {
    const { deps } = setupTurnQueue({
      busy: true,
      queuedMessages: [{ ...queued("q"), intent: "orchestrate" }],
    });

    steerQueuedMessage(deps, "s", "q");

    expect(deps.submit).not.toHaveBeenCalled();
    expect(deps.flushHarnessEvents).toHaveBeenCalled();
  });

  it("resumes a paused queue by continuing the interrupted turn", () => {
    const { deps, session } = setupTurnQueue({ queueStatus: "paused", queuedMessages: [queued("q")] });

    resumeQueue(deps, "s");

    expect(session().queueStatus).toBe("resuming");
    expect(deps.submit).toHaveBeenCalledWith("s", CONTINUE_PROMPT, [], { followUpBehavior: "steer" });
  });
});
