// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { familiarSessionCompletionResult } from "@/features/familiars/model/familiar-session-completion";
import type { ControlOutcome } from "@/features/orchestration/model/orchestration";
import { createEditedResendCoordinator } from "@/features/sessions/model/edit-last-turn";
import { testSession } from "@/integrations/harness/core/test-session";
import { fakeFlowCore } from "./flow-core.fixture";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import { createSubmissionFlows } from "./use-submission-flows";
import { createTabFlows } from "./use-tab-flows";

vi.mock("@/features/familiars/model/familiar", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isFamiliarSession: (id: string) => id === "familiar",
}));

const ensureOpen = vi.fn(async () => null);

function session(id: string, patch: Partial<Session> = {}): Session {
  return { ...testSession("claude", "/work/demo"), id, ...patch };
}

function setup(open: Session[]) {
  const core = fakeFlowCore();
  core.sessionsRef.current = open;
  const tabFlows = createTabFlows(core, {
    terminalCwdRef: { current: "~" },
    displayedTabNavigation: { current: { tabs: [], activeId: "" } },
  });
  const sessionOpeners = {
    ensureOpen,
    focusOpen: vi.fn(),
  } as unknown as SessionOpenerFlows["sessionOpeners"];
  const flows = createSubmissionFlows(core, {
    activeSessionIdRef: { current: undefined },
    projectLocationSyncs: { current: new Map() },
    editedResends: createEditedResendCoordinator(),
    enqueueHarnessEvent: vi.fn(),
    flushHarnessEvents: vi.fn(),
    tabFlows,
    sessionOpeners,
    reminders: { dismissContinuedNotices: vi.fn() },
    projectActions: { moveLocation: vi.fn(async () => undefined) },
    composerActions: { saveDraft: vi.fn() },
    noteReply: vi.fn(),
  });

  return { core, flows };
}

afterEach(() => {
  vi.useRealTimers();
  ensureOpen.mockClear();
});

describe("createSubmissionFlows", () => {
  it("records a relayed approval through the Workspace's sessions and persistence", () => {
    const approval = { id: "a", kind: "command", title: "Run" } as unknown as NonNullable<
      Session["blocks"][number]["approval"]
    >;
    const familiar = session("familiar", {
      blocks: [{ id: "ask", role: "assistant", text: "", approval }],
    });
    const { core, flows } = setup([familiar]);

    flows.familiarChat.decide("familiar", "ask", "allow");

    const decided = core.sessionsRef.current[0];
    expect(decided?.blocks[0]?.approval?.decided).toBe("allow");
    expect(core.setSessions).toHaveBeenCalledWith(core.sessionsRef.current);
    expect(core.persistence.persist).toHaveBeenCalledWith(decided);
  });

  it("posts to a busy Familiar once the window timer fires", () => {
    vi.useFakeTimers();
    const { core, flows } = setup([session("familiar", { busy: true })]);

    flows.familiarChat.append("familiar", { id: "post", role: "assistant", text: "Habit ran" });
    expect(core.sessionsRef.current[0]?.blocks).toHaveLength(0);

    core.sessionsRef.current = [session("familiar")];
    vi.advanceTimersByTime(5_000);

    expect(core.sessionsRef.current[0]?.blocks.map((block) => block.id)).toEqual(["post"]);
  });

  it("keeps a Familiar's completion batch open while it is busy on the launching turn", async () => {
    const { core, flows } = setup([session("familiar", { busy: true })]);
    core.turnGen.current.set("familiar", 1);
    flows.familiarCompletions.batches.watch({ familiarId: "familiar", turn: 1 }, "worker")(
      familiarSessionCompletionResult({
        requestId: "worker",
        sessionId: "worker",
        project: "/work/demo",
        prompt: "Fix it",
        outcome: { status: "completed", text: "Fixed" } as ControlOutcome,
      }),
    );

    flows.familiarCompletions.closeInactive();
    await Promise.resolve();
    expect(ensureOpen).not.toHaveBeenCalled();

    core.turnGen.current.set("familiar", 2);
    flows.familiarCompletions.closeInactive();

    await vi.waitFor(() => expect(ensureOpen).toHaveBeenCalledWith("familiar"));
  });
});
