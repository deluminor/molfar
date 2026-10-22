import { describe, expect, it, vi } from "vitest";
import { familiarTabId } from "@/features/workspace/model/app-view-tabs";
import { fakeFlowCore } from "./flow-core.fixture";
import type { HistoryFlows } from "./use-history-flows";
import type { OrchestrationFlows } from "./use-orchestration-flows";
import type { ProjectFlows } from "./use-project-flows";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import type { SubmissionFlows } from "./use-submission-flows";
import type { SurfaceFlows } from "./use-surface-flows";
import { createTabFlows } from "./use-tab-flows";
import { createTitleTabFlows, type TitleTabFlowsInput } from "./use-title-tab-flows";
import type { TurnQueueFlows } from "./use-turn-queue-flows";
import type { OwnWorkspaceHandlers } from "./workspace-handlers-value";

const confirmReload = vi.hoisted(() => vi.fn(async () => false));
vi.mock("../../../model/app-lifecycle", () => ({ confirmReload }));

function setup() {
  const core = fakeFlowCore();
  const tabFlows = createTabFlows(core, {
    terminalCwdRef: { current: "~" },
    displayedTabNavigation: { current: { tabs: [], activeId: "" } },
  });
  const input: TitleTabFlowsInput = {
    navigation: { current: { tabs: [], activeId: "" } },
    setOpenAppViews: vi.fn(),
    setOpenFamiliarTabs: vi.fn(),
    setTitleTabOrder: vi.fn(),
    openLocalSurface: vi.fn(),
    flows: {
      tab: tabFlows,
      openers: { sessionList: {}, tabActions: {}, sessionOpeners: {} } as SessionOpenerFlows,
      surface: { surfaceDeps: {} } as SurfaceFlows,
      history: {} as HistoryFlows,
      project: { projectActions: { select: vi.fn() } } as unknown as ProjectFlows,
      submission: { submission: {} } as SubmissionFlows,
      turnQueue: {} as TurnQueueFlows,
      orchestration: { workerPanes: {} } as OrchestrationFlows,
    },
    own: {} as OwnWorkspaceHandlers,
    noteProjectStep: vi.fn(),
    rightPanelToggleRef: { current: null },
    visibleTabsRef: { current: { insetLayout: true, activeTabId: "", titleTabs: [] } },
  };

  return { core, input, flows: createTitleTabFlows(core, input) };
}

describe("createTitleTabFlows", () => {
  it("opens a Familiar's title tab through the Workspace's Familiar view", () => {
    const { core, flows } = setup();

    flows.displayedTabs.selectTitleTab(familiarTabId("f"));

    expect(core.familiarView.open).toHaveBeenCalledWith("f");
  });

  it("opens the usage surface through the actions read at call time", () => {
    const { input, flows } = setup();

    flows.navigation.openUsage();

    expect(input.openLocalSurface).toHaveBeenCalledWith("usage");
  });

  it("asks before a reload while the store holds unsaved files", async () => {
    const { core, flows } = setup();
    core.store.getState().setDirtyFiles(new Set(["file:/work/a.ts"]));

    flows.navigation.reload();

    await vi.waitFor(() => expect(confirmReload).toHaveBeenCalledWith(true));
  });

  it("hands out the Workspace handlers from the domain flows and the core", () => {
    const { core, input, flows } = setup();

    expect(flows.handlers.newSessions).toBe(input.flows.tab.newSessions);
    expect(flows.handlers.tabs).toBe(input.flows.openers.tabActions);
    expect(flows.handlers.submission).toBe(input.flows.submission.submission);
    expect(flows.handlers.familiarView).toBe(core.familiarView);
    expect(flows.handlers.prefetchSession).toBe(core.loader.prefetch);
    expect(flows.handlers.navigation).toBe(flows.navigation);
    expect(flows.handlers.displayedTabs).toBe(flows.displayedTabs);
  });
});
