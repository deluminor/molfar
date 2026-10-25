import { describe, expect, it, vi } from "vitest";
import type { TabVisits } from "../../flows/tabs/tab-visits";
import { fakeFlowCore } from "./flow-core.fixture";
import { createSessionOpenerFlows } from "./use-session-opener-flows";
import { createTabFlows } from "./use-tab-flows";

function setup() {
  const core = fakeFlowCore();
  const tabFlows = createTabFlows(core, {
    terminalCwdRef: { current: "~" },
    displayedTabNavigation: { current: { tabs: [], activeId: "" } },
  });
  const reveal = vi.fn();
  const flows = createSessionOpenerFlows(core, {
    tabFlows,
    visits: {} as TabVisits,
    linkedUpdateCards: { reveal },
    linkedUpdatesRef: { current: new Map() },
    navigationIdsRef: { current: ["a", "b"] },
    deckTabsRef: { current: [] },
  });

  return { core, flows, reveal };
}

describe("createSessionOpenerFlows", () => {
  it("routes the session list through the Workspace's loader, navigation and Familiar view", async () => {
    const { core, flows } = setup();

    flows.sessionList.prefetch("s");
    flows.sessionList.cancelNavigation();
    await flows.sessionList.openFamiliar("f");

    expect(core.loader.prefetch).toHaveBeenCalledWith("s");
    expect(core.navigation.cancel).toHaveBeenCalledOnce();
    expect(core.familiarView.open).toHaveBeenCalledWith("f");
    expect(flows.sessionList.navigationIds.current).toEqual(["a", "b"]);
  });

  it("opens a saved session through the openers built after the pane deps", async () => {
    const { core, flows } = setup();

    await expect(flows.sessionList.ensureOpenSession("missing")).resolves.toBeNull();

    expect(core.loader.load).toHaveBeenCalledWith("missing");
  });

  it("places sessions in the project scope", () => {
    expect(setup().flows.place.scope).toBe("project");
  });
});
