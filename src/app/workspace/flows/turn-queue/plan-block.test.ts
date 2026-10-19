import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/session/block";
import { buildPlan, updatePlan } from "./plan-block";
import { setupTurnQueue } from "./turn-queue.fixture";

const plan = (status: NonNullable<Block["plan"]>["status"]): Block => ({
  id: "p",
  role: "plan",
  text: "1. Fix",
  plan: { status },
});

describe("plan blocks", () => {
  it("records an edit to a ready plan against its original text", () => {
    const { deps, session } = setupTurnQueue({ blocks: [plan("ready")] });

    updatePlan(deps, "s", "p", "1. Fix\n2. Test");

    expect(session().blocks[0]).toMatchObject({
      text: "1. Fix\n2. Test",
      plan: { status: "ready", originalText: "1. Fix", edited: true },
    });
  });

  it("leaves a plan the agent is still writing alone", () => {
    const { deps, session } = setupTurnQueue({ blocks: [plan("streaming")] });

    updatePlan(deps, "s", "p", "changed");

    expect(session().blocks[0].text).toBe("1. Fix");
  });

  it("builds a ready plan as a build turn", () => {
    const { deps } = setupTurnQueue({ blocks: [plan("ready")] });

    buildPlan(deps, "s", "p");

    expect(deps.submit).toHaveBeenCalledWith("s", "Build approved plan", [], {
      intent: "build",
      planBlockId: "p",
      buildTarget: undefined,
    });
  });

  it("does not build a plan while the session is busy or once built", () => {
    const busy = setupTurnQueue({ busy: true, blocks: [plan("ready")] });
    const built = setupTurnQueue({ blocks: [plan("built")] });

    buildPlan(busy.deps, "s", "p");
    buildPlan(built.deps, "s", "p");

    expect(busy.deps.submit).not.toHaveBeenCalled();
    expect(built.deps.submit).not.toHaveBeenCalled();
  });
});
