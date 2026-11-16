import { describe, expect, it, vi } from "vitest";
import { submitBusyFollowUp } from "./busy-follow-up";
import { setupSubmission } from "./submission.fixture";
import { prepareSubmission } from "./submission-preflight";

const harness = vi.hoisted(() => ({ steerable: true, steered: [] as string[] }));

vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  isLiveHarness: () => true,
  canSteerHarness: () => harness.steerable,
  steerHarnessTurn: async (input: { text: string }) => {
    harness.steered.push(input.text);
  },
}));
vi.mock("@/features/sessions/model/prompt-preparation", () => ({
  preparePrompt: async (text: string) => text,
}));

function busyTurn(text: string, options = {}) {
  const setup = setupSubmission({ busy: true });
  const turn = prepareSubmission(setup.deps, setup.session(), text, [], options);
  if (!turn) throw new Error("turn refused");
  return { ...setup, turn };
}

describe("submitBusyFollowUp", () => {
  it("leaves an idle session to a new turn", () => {
    const { deps, session } = setupSubmission();
    const turn = prepareSubmission(deps, session(), "hi", []);

    expect(turn && submitBusyFollowUp(deps, turn)).toBeUndefined();
  });

  it("queues a plan request behind the running turn", () => {
    const { deps, session, turn } = busyTurn("plan it", { intent: "plan" });

    expect(submitBusyFollowUp(deps, turn)).toBe(true);
    expect(session().queuedMessages?.map((message) => message.text)).toEqual(["plan it"]);
    expect(session().queueStatus).toBe("active");
  });

  it("steers a follow-up into the running turn", async () => {
    harness.steerable = true;
    harness.steered = [];
    const { deps, session, turn } = busyTurn("also tests", { followUpBehavior: "steer" });

    expect(submitBusyFollowUp(deps, turn)).toBe(true);
    expect(session().blocks.at(-1)).toMatchObject({ role: "user", text: "also tests" });
    await vi.waitFor(() => expect(harness.steered).toEqual(["also tests"]));
  });

  it("says so when the harness cannot take a follow-up mid-turn", () => {
    harness.steerable = false;
    const { deps, turn } = busyTurn("also tests", { followUpBehavior: "steer" });

    expect(submitBusyFollowUp(deps, turn)).toBe(false);
    expect(deps.flushHarnessEvents).toHaveBeenCalled();
  });
});
