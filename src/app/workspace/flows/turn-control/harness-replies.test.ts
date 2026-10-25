import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { answerApproval, answerQuestion, keepQuestionOpen } from "./harness-replies";

const harness = vi.hoisted(() => ({
  approvals: [] as unknown[][],
  answers: [] as unknown[][],
  kept: [] as unknown[][],
  relay: undefined as { runId: string; requestId: number } | undefined,
}));

vi.mock("@/integrations/harness", () => ({
  respondHarnessApproval: (...args: unknown[]) => harness.approvals.push(args),
  respondHarnessQuestion: (...args: unknown[]) => harness.answers.push(args),
  keepHarnessQuestionOpen: (...args: unknown[]) => harness.kept.push(args),
}));
vi.mock("@/features/familiars/model/familiar", () => ({
  isFamiliarSession: (id: string) => id === "familiar",
}));
vi.mock("@/features/familiars/model/familiar-habits", () => ({
  takeRelayedApproval: () => harness.relay,
}));

const asked = {
  id: "ask",
  role: "assistant" as const,
  text: "",
  familiarHabit: { id: "h", name: "Habit", at: 1 },
  approval: { requestId: 5, title: "Run", kind: "execute" },
};

function setup(sessions: Partial<Session>[]) {
  const open = sessions.map((patch) => ({ ...testSession("claude", "/work/demo"), ...patch }));
  const decideFamiliarApproval = vi.fn();
  return { deps: { sessions: () => open, decideFamiliarApproval }, decideFamiliarApproval };
}

describe("harness replies", () => {
  beforeEach(() => {
    harness.approvals = [];
    harness.answers = [];
    harness.kept = [];
    harness.relay = undefined;
  });

  it("answers an approval through the session's harness", () => {
    const { deps } = setup([{ id: "s" }]);

    answerApproval(deps, "s", 7, "allow");

    expect(harness.approvals).toEqual([["claude", "s", 7, "allow"]]);
  });

  it("ignores replies for a session whose worktree is gone", () => {
    const { deps } = setup([{ id: "s", worktreeRemoved: true }]);

    answerApproval(deps, "s", 7, "allow");
    answerQuestion(deps, "s", 7, { answers: {} } as never);
    keepQuestionOpen(deps, "s", 7);

    expect([harness.approvals, harness.answers, harness.kept]).toEqual([[], [], []]);
  });

  it("answers a Familiar's relayed approval on the habit run and settles the chat", () => {
    harness.relay = { runId: "run", requestId: 2 };
    const { deps, decideFamiliarApproval } = setup([
      { id: "familiar", blocks: [asked] as Session["blocks"] },
      { id: "run" },
    ]);

    answerApproval(deps, "familiar", 5, "deny");

    expect(harness.approvals).toEqual([["claude", "run", 2, "deny"]]);
    expect(decideFamiliarApproval).toHaveBeenCalledWith("familiar", "ask", "deny");
  });

  it("cancels a Familiar's relayed approval whose run is gone", () => {
    const { deps, decideFamiliarApproval } = setup([
      { id: "familiar", blocks: [asked] as Session["blocks"] },
    ]);

    answerApproval(deps, "familiar", 5, "allow");

    expect(harness.approvals).toEqual([]);
    expect(decideFamiliarApproval).toHaveBeenCalledWith("familiar", "ask", "cancelled");
  });

  it("answers and keeps open a question through the harness", () => {
    const { deps } = setup([{ id: "s" }]);
    const reply = { answers: {} } as never;

    answerQuestion(deps, "s", 3, reply);
    keepQuestionOpen(deps, "s", 3);

    expect(harness.answers).toEqual([["claude", "s", 3, reply]]);
    expect(harness.kept).toEqual([["claude", "s", 3]]);
  });
});
