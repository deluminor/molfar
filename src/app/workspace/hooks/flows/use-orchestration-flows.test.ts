import { describe, expect, it, vi } from "vitest";
import type { TaskBoardRuntime } from "@/features/task-board/hooks/use-task-board-engine";
import type { HistoryFlows } from "./use-history-flows";
import { fakeFlowCore } from "./flow-core.fixture";
import { createOrchestrationFlows, type OrchestrationFlowsInput } from "./use-orchestration-flows";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import type { SubmissionFlows } from "./use-submission-flows";
import { createTabFlows } from "./use-tab-flows";

function setup() {
  const core = fakeFlowCore();
  const tabFlows = createTabFlows(core, {
    terminalCwdRef: { current: "~" },
    displayedTabNavigation: { current: { tabs: [], activeId: "" } },
  });
  const input: OrchestrationFlowsInput = {
    flushHarnessEvents: vi.fn(),
    submission: { submit: vi.fn(), send: vi.fn() } as unknown as SubmissionFlows["submission"],
    automationRuns: { launchQuick: vi.fn() } as unknown as SubmissionFlows["automationRuns"],
    familiarCompletions: { batches: {} } as unknown as SubmissionFlows["familiarCompletions"],
    worktreeDeps: {} as HistoryFlows["worktreeDeps"],
    historyActions: { remove: vi.fn() } as unknown as HistoryFlows["historyActions"],
    turnActions: { stop: vi.fn() },
    tabFlows,
    sessionOpeners: {} as SessionOpenerFlows["sessionOpeners"],
    composerActions: { saveDraft: vi.fn() },
    board: vi.fn(() => ({}) as TaskBoardRuntime),
    setDismissedLiveAgentIds: vi.fn(),
    unseenFinishedRef: { current: new Set(["s"]) },
    projectTerminalFocusedRef: { current: false },
  };

  return { core, input, flows: createOrchestrationFlows(core, input) };
}

describe("createOrchestrationFlows", () => {
  it("reads the focused terminal and active tab at call time for Escape", () => {
    const { core, input, flows } = setup();

    expect(flows.escapeStop.terminalFocused()).toBe(false);
    input.projectTerminalFocusedRef.current = true;
    core.activeTabIdRef.current = "t";

    expect(flows.escapeStop.terminalFocused()).toBe(true);
    expect(flows.escapeStop.activeTabId()).toBe("t");
  });

  it("stops a session for the orchestrator as a managed stop", () => {
    const { input, flows } = setup();

    flows.orchestratorBinding.stop("s", true);
    flows.escapeStop.stop("e");

    expect(input.turnActions.stop).toHaveBeenNthCalledWith(1, "s", true);
    expect(input.turnActions.stop).toHaveBeenNthCalledWith(2, "e");
  });

  it("selects a synced tab as a click does", () => {
    const { core, flows } = setup();

    flows.orchestrationSync.setActiveTabId("t");

    expect(core.selectTab).toHaveBeenCalledWith("t");
  });
});
