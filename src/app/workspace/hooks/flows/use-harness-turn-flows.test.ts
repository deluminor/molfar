import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { HarnessEventPipelineDeps } from "../../flows/harness-events/harness-event-pipeline";
import type { HarnessReplyDeps } from "../../flows/turn-control/harness-replies";
import type { TurnControlDeps } from "../../flows/turn-control/turn-control-deps";
import { createHarnessTurnFlows } from "./use-harness-turn-flows";

const mocks = vi.hoisted(() => ({
  pipeline: undefined as HarnessEventPipelineDeps | undefined,
  turns: undefined as { control: TurnControlDeps; reply: HarnessReplyDeps } | undefined,
  flush: vi.fn(),
  enqueue: vi.fn(),
  syncDockBadge: vi.fn(),
  isForegroundSession: vi.fn((_id: string, _view: unknown) => true),
  stopForSession: vi.fn(async (_id: string) => undefined),
  cancelHarnessTurn: vi.fn(async (_harness: string, _id: string) => undefined),
  stopHarnessSession: vi.fn(async (_harness: string, _id: string) => undefined),
  finishSessionTurn: vi.fn(async (_id: string, _cwd: string) => undefined),
}));

vi.mock("../../flows/harness-events/harness-event-pipeline", () => ({
  createHarnessEventPipeline: (deps: HarnessEventPipelineDeps) => {
    mocks.pipeline = deps;
    return { flush: mocks.flush, enqueue: mocks.enqueue };
  },
}));
vi.mock("../../flows/turn-control/turn-control-actions", () => ({
  createTurnControlActions: (deps: { control: TurnControlDeps; reply: HarnessReplyDeps }) => {
    mocks.turns = deps;
    return { kind: "turns" };
  },
}));
vi.mock("../../flows/harness-events/foreground-session", () => ({ isForegroundSession: mocks.isForegroundSession }));
vi.mock("@/features/notifications/model/dock-badge", () => ({ syncDockBadge: mocks.syncDockBadge }));
vi.mock("@/features/orchestration/model/orchestration", () => ({
  orchestrator: { stopForSession: mocks.stopForSession },
}));
vi.mock("@/integrations/harness", () => ({
  cancelHarnessTurn: mocks.cancelHarnessTurn,
  stopHarnessSession: mocks.stopHarnessSession,
}));
vi.mock("@/features/sessions/model/checkpoint", () => ({ finishSessionTurn: mocks.finishSessionTurn }));
vi.mock("@/features/sessions/model/handoff", () => ({ sessionChildHarnesses: (session: Session) => [session.harness] }));
vi.mock("@/domain/session/session-state", () => ({ sessionWorkCwd: (session: Session) => session.cwd }));

afterEach(() => vi.clearAllMocks());

const chat = (id: string, busy = false): Session => ({ id, busy, harness: "codex", cwd: "/p" }) as unknown as Session;

function build(sessions: Session[] = []) {
  const sessionsRef = { current: sessions };
  const update = vi.fn((_update: unknown, _textOnly?: boolean) => sessionsRef.current);
  const setSessions = vi.fn();
  const decideFamiliarApproval = vi.fn();
  const turnGen = { current: new Map<string, number>() };
  const flows = createHarnessTurnFlows({
    sessionsRef,
    sessionState: { update },
    setSessions,
    tabsRef: { current: [{ id: "t" }] as WorkspaceTab[] },
    activeTabIdRef: { current: "t" },
    foregroundSurfaceRef: { current: { workspaceVisible: true } },
    turnGen,
    decideFamiliarApproval,
  });
  return { flows, sessionsRef, update, setSessions, decideFamiliarApproval, turnGen };
}

describe("createHarnessTurnFlows", () => {
  it("applies pipeline updates and syncs the badge only when a non-text batch changed the chats", () => {
    const { update, sessionsRef } = build([chat("a")]);
    const changed = [chat("b")];
    update.mockImplementationOnce(() => sessionsRef.current).mockImplementationOnce(() => changed);
    const apply = (list: Session[]) => list;

    mocks.pipeline?.updateSessions(apply, false);
    mocks.pipeline?.updateSessions(apply, false);
    mocks.pipeline?.updateSessions(apply, true);

    expect(update.mock.calls.map(([, textOnly]) => textOnly)).toEqual([false, false, true]);
    expect(mocks.syncDockBadge.mock.calls).toEqual([[changed]]);
  });

  it("asks whether a chat is on screen with the surface and the active tab", () => {
    build();
    mocks.pipeline?.isForeground("a");

    expect(mocks.isForegroundSession).toHaveBeenCalledWith("a", {
      hidden: false,
      workspaceVisible: true,
      activeTab: { id: "t" },
    });
  });

  it("wires turn control to the latest chats, the pipeline and the Familiar approvals", () => {
    const { flows, sessionsRef, setSessions, decideFamiliarApproval, turnGen } = build([chat("a")]);
    const control = mocks.turns?.control;
    const next = [chat("b")];
    control?.commitSessions(next);
    mocks.turns?.reply.decideFamiliarApproval("f", "block", "allow");

    expect(flows.turnActions).toEqual({ kind: "turns" });
    expect(control?.sessions()).toBe(next);
    expect(sessionsRef.current).toBe(next);
    expect(setSessions).toHaveBeenCalledWith(next);
    expect(mocks.syncDockBadge).toHaveBeenCalledWith(next);
    expect(control?.turnGen).toBe(turnGen.current);
    expect([control?.enqueueHarnessEvent, control?.flushHarnessEvents]).toEqual([mocks.enqueue, mocks.flush]);
    expect(decideFamiliarApproval).toHaveBeenCalledWith("f", "block", "allow");
  });

  it("returns an idle chat at once and stops a running one before it is removed", async () => {
    const { flows, turnGen } = build([chat("idle"), chat("busy", true)]);

    expect(await flows.stopSessionForRemoval("idle")).toEqual(chat("idle"));
    expect(mocks.cancelHarnessTurn).not.toHaveBeenCalled();

    await flows.stopSessionForRemoval("busy");

    expect(mocks.stopForSession.mock.calls).toEqual([["idle"], ["busy"]]);
    expect(turnGen.current.get("busy")).toBe(1);
    expect(mocks.cancelHarnessTurn).toHaveBeenCalledWith("codex", "busy");
    expect(mocks.stopHarnessSession).toHaveBeenCalledWith("codex", "busy");
    expect(mocks.finishSessionTurn).toHaveBeenCalledWith("busy", "/p");
    expect(mocks.flush).toHaveBeenCalledTimes(2);
  });
});
