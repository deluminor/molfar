// @vitest-environment happy-dom
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyHarnessEvent } from "@/integrations/harness/core/apply";
import { loadSessionMcpServersForSession } from "@/integrations/harness/core/session-mcp-servers";
import { setupSubmission } from "./submission.fixture";
import { prepareSubmission } from "./submission-preflight";
import { createTurnEvents } from "./turn-events";
import { finishTurn } from "./turn-finish";
import { startTurnRun, type TurnContext } from "./turn-run";
import { setUpTurn } from "./turn-setup";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/features/sessions/model/checkpoint", () => ({
  flushSessionCheckpoint: vi.fn(async () => undefined),
  notifyReviewChanged: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

function setupTurn() {
  const { deps, session } = setupSubmission();
  deps.enqueueHarnessEvent = (_sessionId, event) => {
    deps.sessionsRef.current = [applyHarnessEvent(session(), event)];
  };
  const turn = prepareSubmission(deps, session(), "Hello", [], { onSettled: vi.fn() });
  if (!turn) throw new Error("Submission was refused");

  const setup = setUpTurn(turn, 1);
  const context: TurnContext = {
    deps,
    turn,
    setup,
    run: startTurnRun(turn, setup),
    isCurrent: () => true,
    commitSubmittedTurn: vi.fn(),
  };
  const events = createTurnEvents(context);

  return { context, events, session };
}

describe("optional MCP loading through turn completion", () => {
  it("shows a nonfatal notice and completes a successful provider after IPC rejection", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("MCP IPC unavailable"));
    const { context, events, session } = setupTurn();

    const servers = await loadSessionMcpServersForSession(
      "claude",
      context.run.workCwd,
      events.routeTurnEvent,
    );
    events.routeTurnEvent({ type: "message.delta", text: "Successful reply" });
    events.routeTurnEvent({ type: "message.completed" });
    context.run.buildSucceeded = true;
    await finishTurn(context, events.planEventKey);

    expect(servers).toEqual([]);
    expect(context.run.providerFailureSeen).toBe(false);
    expect(context.run.controlOutcome).toEqual({ status: "completed", text: "Successful reply" });
    expect(session().blocks).toContainEqual(expect.objectContaining({
      role: "system",
      text: expect.stringContaining("Could not load MCP servers for claude"),
    }));
    expect(session().blocks.some((block) => block.notice === "error")).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "[molfar] session_mcp_servers failed",
      expect.objectContaining({ provider: "claude", cwd: "/work/demo" }),
    );
  });

  it("preserves a genuine provider failure after the optional MCP fallback", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("MCP IPC unavailable"));
    const { context, events, session } = setupTurn();

    await loadSessionMcpServersForSession("claude", context.run.workCwd, events.routeTurnEvent);
    events.routeTurnEvent({ type: "session.error", message: "Provider refused the turn" });
    events.routeTurnEvent({ type: "message.completed" });
    context.run.buildSucceeded = true;
    await finishTurn(context, events.planEventKey);

    expect(context.run.controlOutcome).toMatchObject({
      status: "failed",
      error: "Provider refused the turn",
    });
    expect(session().blocks).toContainEqual(expect.objectContaining({
      notice: "error",
      text: "Provider refused the turn",
    }));
  });

  it("does not complete a provider that never finished successfully", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("MCP IPC unavailable"));
    const { context, events } = setupTurn();

    await loadSessionMcpServersForSession("claude", context.run.workCwd, events.routeTurnEvent);
    events.routeTurnEvent({ type: "message.delta", text: "Partial reply" });
    await finishTurn(context, events.planEventKey);

    expect(context.run.controlOutcome).toMatchObject({ status: "failed", text: "Partial reply" });
  });
});
