import { describe, expect, it, vi } from "vitest";
import { compactContext } from "./compact-context";
import { answerApproval, answerQuestion, type HarnessReplyDeps, keepQuestionOpen } from "./harness-replies";
import { stopTurn } from "./stop-turn";
import { createTurnControlActions } from "./turn-control-actions";
import type { TurnControlDeps } from "./turn-control-deps";

vi.mock("./compact-context", () => ({ compactContext: vi.fn(() => true) }));
vi.mock("./stop-turn", () => ({ stopTurn: vi.fn() }));
vi.mock("./harness-replies", () => ({ answerApproval: vi.fn(), answerQuestion: vi.fn(), keepQuestionOpen: vi.fn() }));

const control = { sessions: () => [] } as unknown as TurnControlDeps;
const reply = { sessions: () => [] } as unknown as HarnessReplyDeps;

describe("createTurnControlActions", () => {
  it("stops and compacts over the turn control deps, unmanaged by default", () => {
    const turns = createTurnControlActions({ control, reply });

    turns.stop("s");
    turns.stop("s", true);
    expect(turns.compact("s")).toBe(true);

    expect(vi.mocked(stopTurn).mock.calls).toEqual([
      [control, "s", false],
      [control, "s", true],
    ]);
    expect(compactContext).toHaveBeenCalledWith(control, "s");
  });

  it("answers approvals and questions over the reply deps", () => {
    const turns = createTurnControlActions({ control, reply });

    turns.approve("s", 1, "allow" as never);
    turns.answer("s", 2, { answers: {} } as never);
    turns.keepQuestionOpen("s", 2);

    expect(answerApproval).toHaveBeenCalledWith(reply, "s", 1, "allow");
    expect(answerQuestion).toHaveBeenCalledWith(reply, "s", 2, { answers: {} });
    expect(keepQuestionOpen).toHaveBeenCalledWith(reply, "s", 2);
  });
});
