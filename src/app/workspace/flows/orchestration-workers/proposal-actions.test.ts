import { describe, expect, it, vi } from "vitest";
import type { OrchestrationProposal } from "@/domain/orchestration/proposal";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createProposalActions, type ProposalActionsDeps } from "./proposal-actions";

vi.mock("@/features/orchestration/model/orchestration-plan", () => ({
  validateOrchestrationSettings: (settings: unknown) => settings,
  withOrchestrationProposal: (session: Session, blockId: string, orchestration: OrchestrationProposal) => ({
    ...session,
    blocks: session.blocks.map((block) => (block.id === blockId ? { ...block, orchestration } : block)),
  }),
}));

function proposal(status: string, overrides: Partial<OrchestrationProposal> = {}): OrchestrationProposal {
  return {
    status,
    request: "build it",
    author: { harness: "claude", model: "m" },
    settings: { maxWorkers: 2 },
    tasks: [],
    ...overrides,
  } as unknown as OrchestrationProposal;
}

function setup(card = proposal("ready"), sessionOverrides: Partial<Session> = {}) {
  const lead: Session = {
    ...testSession("claude", "/work/demo"),
    id: "lead",
    model: "m",
    blocks: [{ id: "card", role: "assistant", text: "", orchestration: card }],
    ...sessionOverrides,
  };
  const deps = {
    sessionsRef: { current: [lead] },
    confirming: { current: new Set<string>() },
    orchestrator: { hydrate: vi.fn(async () => undefined), startApproved: vi.fn(async () => undefined) },
    setSessions: vi.fn(),
    saveSession: vi.fn(async () => true),
    submit: vi.fn(),
  } satisfies ProposalActionsDeps;
  const statusOf = () => deps.sessionsRef.current[0]!.blocks[0]!.orchestration?.status;
  return { deps, actions: createProposalActions(deps), statusOf };
}

describe("proposal actions", () => {
  it("confirms a ready proposal: saves the starting card first, then approves", async () => {
    const { deps, actions, statusOf } = setup();

    await actions.confirm("lead", "card");

    expect(deps.saveSession).toHaveBeenCalled();
    expect(deps.orchestrator.startApproved).toHaveBeenCalled();
    expect(statusOf()).toBe("approved");
    expect(deps.confirming.current.size).toBe(0);
  });

  it("puts the card back to ready when starting fails", async () => {
    const { deps, actions, statusOf } = setup();
    deps.orchestrator.startApproved.mockRejectedValue(new Error("no worker"));

    await expect(actions.confirm("lead", "card")).rejects.toThrow("no worker");

    expect(statusOf()).toBe("ready");
    expect(deps.confirming.current.size).toBe(0);
  });

  it("refuses to confirm after the lead model changed", async () => {
    const { deps, actions } = setup(proposal("ready"), { model: "other" });

    await expect(actions.confirm("lead", "card")).rejects.toThrow("lead model has changed");

    expect(deps.orchestrator.startApproved).not.toHaveBeenCalled();
  });

  it("refuses to confirm while the lead is busy", async () => {
    const { actions } = setup(proposal("ready"), { busy: true });

    await expect(actions.confirm("lead", "card")).rejects.toThrow("Wait for the proposal");
  });

  it("ignores a second confirm for the same lead", async () => {
    const { deps, actions } = setup();
    deps.confirming.current.add("lead");

    await actions.confirm("lead", "card");

    expect(deps.orchestrator.hydrate).not.toHaveBeenCalled();
  });

  it("applies task and worker-count edits only to a ready proposal", () => {
    const ready = setup();
    ready.actions.update("lead", "card", proposal("ready", { tasks: [{ id: "t" }] as never, settings: { maxWorkers: 4 } as never }));
    expect(ready.deps.sessionsRef.current[0]!.blocks[0]!.orchestration?.tasks).toHaveLength(1);

    const approved = setup(proposal("approved"));
    approved.actions.update("lead", "card", proposal("ready", { tasks: [{ id: "t" }] as never }));
    expect(approved.deps.setSessions).not.toHaveBeenCalled();
  });

  it("retries by resubmitting the request as an orchestration", () => {
    const { deps, actions } = setup(proposal("failed"));

    actions.retry("lead", "card");

    expect(deps.submit).toHaveBeenCalledWith("lead", "build it", [], {
      intent: "orchestrate",
      orchestrationRetry: expect.objectContaining({ status: "failed" }),
    });
  });
});
