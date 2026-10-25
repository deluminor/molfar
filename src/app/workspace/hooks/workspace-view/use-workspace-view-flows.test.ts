import { describe, expect, it, vi } from "vitest";
import type { WorkspaceViewFlowsInput } from "./types";
import { useWorkspaceViewFlows } from "./use-workspace-view-flows";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  navigation: {
    titleTabFlows: { kind: "title tabs" },
    titleTabs: [],
    histories: { kind: "histories" },
    inboxActivity: { kind: "activity" },
    inboxView: { kind: "inbox" },
    localSurfaceActions: { kind: "local" },
    rightPanelToggleRef: { current: null },
  },
  chrome: { dockSlide: { kind: "dock" }, familiarViewFamiliar: undefined, familiarOverview: {}, chrome: { kind: "chrome" } },
}));

vi.mock("./use-navigation-view-flows", () => ({
  useNavigationViewFlows: () => {
    mocks.calls.push("navigation");
    return mocks.navigation;
  },
}));
vi.mock("./use-chrome-view-flows", () => ({
  useChromeViewFlows: (_input: unknown, navigation: unknown) => {
    mocks.calls.push(navigation === mocks.navigation ? "chrome after navigation" : "chrome");
    return mocks.chrome;
  },
}));

describe("useWorkspaceViewFlows", () => {
  it("runs the navigation views before the chrome and hands the view everything but the toggle ref", () => {
    const { titleTabFlows, view } = useWorkspaceViewFlows({} as WorkspaceViewFlowsInput);
    const { titleTabFlows: _flows, rightPanelToggleRef: _ref, ...shown } = mocks.navigation;

    expect(mocks.calls).toEqual(["navigation", "chrome after navigation"]);
    expect(titleTabFlows).toBe(mocks.navigation.titleTabFlows);
    expect(view).toEqual({ ...shown, ...mocks.chrome });
    expect(view).not.toHaveProperty("rightPanelToggleRef");
  });
});
