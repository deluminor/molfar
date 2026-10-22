import { describe, expect, it, vi } from "vitest";
import { fakeFlowCore } from "./flow-core.fixture";
import { createTabFlows } from "./use-tab-flows";

const input = {
  terminalCwdRef: { current: "/work/demo" },
  displayedTabNavigation: { current: { tabs: [], activeId: "" } },
};

describe("createTabFlows", () => {
  it("keeps a running workspace switch only for workspace selections", () => {
    const core = fakeFlowCore();
    const { focus } = createTabFlows(core, input);

    focus.selectTab("a", "workspace");
    focus.selectTab("b", "session");

    expect(core.setActiveTabId).toHaveBeenCalledWith("a");
    expect(core.selectTab).toHaveBeenCalledWith("b");
    expect(core.setActiveTabId).toHaveBeenCalledTimes(1);
  });

  it("reads the Workspace's refs at call time", () => {
    const core = fakeFlowCore();
    const { focus, layout } = createTabFlows(core, input);
    vi.mocked(core.projectOfTab).mockReturnValue("demo");

    core.activeTabIdRef.current = "later";
    core.projectCwdRef.current = "/work/other";

    expect(focus.activeTabId()).toBe("later");
    expect(layout.activeTabId()).toBe("later");
    expect(focus.projectCwd()).toBe("/work/other");
    expect(layout.projectOfTab("t")).toBe("demo");
  });

  it("leaves covering views through the Familiar view", () => {
    const core = fakeFlowCore();

    createTabFlows(core, input).focus.leaveCoveringViews();

    expect(core.closeFamiliarView).toHaveBeenCalledOnce();
  });
});
