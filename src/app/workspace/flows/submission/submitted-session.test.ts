import { describe, expect, it, vi } from "vitest";
import type { Block } from "@/domain/session/block";
import { setupSubmission } from "./submission.fixture";
import { prepareSubmission } from "./submission-preflight";
import { submittedSession } from "./submitted-session";
import { setUpTurn } from "./turn-setup";

const live = vi.hoisted(() => ({ value: true }));

vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  isLiveHarness: () => live.value,
}));

const plan: Block = { id: "p", role: "plan", text: "1. Fix", plan: { status: "ready" } };

function submitted(text: string, options = {}, blocks: Block[] = []) {
  const { deps, session } = setupSubmission({ blocks });
  const turn = prepareSubmission(deps, session(), text, [], options);
  if (!turn) throw new Error("turn refused");
  return submittedSession(session(), turn, setUpTurn(turn, 1));
}

describe("submittedSession", () => {
  it("adds the user's message and titles a first turn after it", () => {
    live.value = true;

    const next = submitted("Fix the flaky login test");

    expect(next.busy).toBe(true);
    expect(next.blocks.at(-1)).toMatchObject({ role: "user", text: "Fix the flaky login test" });
    expect(next.title).toContain("Fix the flaky login test");
  });

  it("marks the approved plan as building", () => {
    live.value = true;

    const next = submitted("Build", { intent: "build", planBlockId: "p" }, [plan]);

    expect(next.blocks[0].plan).toMatchObject({ status: "building", approvedText: "1. Fix" });
    expect(next.blocks.at(-1)).toMatchObject({ role: "user", text: "Build approved plan" });
  });

  it("notes that an offline harness is not connected", () => {
    live.value = false;

    const next = submitted("hello");

    expect(next.busy).toBe(false);
    expect(next.blocks.at(-1)).toMatchObject({ role: "system", notice: "error" });
    expect(next.blocks.at(-2)).toMatchObject({ role: "user", text: "hello" });
  });
});
