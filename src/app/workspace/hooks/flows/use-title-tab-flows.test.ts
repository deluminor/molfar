import { describe, expect, it, vi } from "vitest";
import { familiarTabId } from "@/features/workspace/model/app-view-tabs";
import { fakeFlowCore } from "./flow-core.fixture";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import type { SurfaceFlows } from "./use-surface-flows";
import { createTabFlows } from "./use-tab-flows";
import { createTitleTabFlows, type TitleTabFlowsInput } from "./use-title-tab-flows";

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
    sessionList: {} as SessionOpenerFlows["sessionList"],
    tabActions: {} as SessionOpenerFlows["tabActions"],
    surfaceDeps: {} as SurfaceFlows["surfaceDeps"],
    tabFlows,
    projectActions: { select: vi.fn() },
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
});
