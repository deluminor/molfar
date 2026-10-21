import { describe, expect, it, vi } from "vitest";
import { buildPlan, updatePlan } from "./plan-block";
import {
  editQueuedMessage,
  removeQueuedMessage,
  resumeQueue,
  setQueuedMessageEditing,
  steerQueuedMessage,
} from "./queue-actions";
import { createTurnQueueActions } from "./turn-queue-actions";
import type { TurnQueueDeps } from "./turn-queue-deps";

vi.mock("./plan-block", () => ({ buildPlan: vi.fn(), updatePlan: vi.fn() }));
vi.mock("./queue-actions", () => ({
  editQueuedMessage: vi.fn(),
  removeQueuedMessage: vi.fn(),
  resumeQueue: vi.fn(),
  setQueuedMessageEditing: vi.fn(),
  steerQueuedMessage: vi.fn(),
}));

describe("createTurnQueueActions", () => {
  it("binds the plan and queued message flows to the queue deps", () => {
    const deps = { sessions: () => [] } as unknown as TurnQueueDeps;
    const queue = createTurnQueueActions(deps);

    queue.updatePlan("s", "b", "plan");
    queue.buildPlan("s", "b");
    queue.removeQueued("s", "m");
    queue.setQueuedEditing("s");
    queue.editQueued("s", "m", "text");
    queue.steerQueued("s", "m");
    queue.resume("s");

    expect(updatePlan).toHaveBeenCalledWith(deps, "s", "b", "plan");
    expect(buildPlan).toHaveBeenCalledWith(deps, "s", "b", undefined);
    expect(removeQueuedMessage).toHaveBeenCalledWith(deps, "s", "m");
    expect(setQueuedMessageEditing).toHaveBeenCalledWith(deps, "s", undefined);
    expect(editQueuedMessage).toHaveBeenCalledWith(deps, "s", "m", "text");
    expect(steerQueuedMessage).toHaveBeenCalledWith(deps, "s", "m");
    expect(resumeQueue).toHaveBeenCalledWith(deps, "s");
  });
});
