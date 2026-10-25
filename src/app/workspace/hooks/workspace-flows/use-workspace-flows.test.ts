// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceFlowCore } from "../flows/workspace-flow-core";
import { mountHook } from "../../testing/mount-hook";
import type { WorkspaceFlowsInput } from "./types";
import { useWorkspaceFlows, workspaceFlowCore } from "./use-workspace-flows";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  cores: [] as WorkspaceFlowCore[],
  opening: { tabFlows: { kind: "tabs" } },
  running: { taskBoard: { kind: "board" } },
}));

vi.mock("./use-opening-flows", () => ({
  useOpeningFlows: (core: WorkspaceFlowCore) => {
    mocks.calls.push("opening");
    mocks.cores.push(core);
    return mocks.opening;
  },
}));
vi.mock("./use-running-flows", () => ({
  useRunningFlows: (core: WorkspaceFlowCore, _input: unknown, opening: unknown) => {
    mocks.calls.push(opening === mocks.opening ? "running after opening" : "running");
    mocks.cores.push(core);
    return mocks.running;
  },
}));

afterEach(() => {
  mocks.calls = [];
  mocks.cores = [];
});

const ref = <T,>(current: T) => ({ current });

function input(): WorkspaceFlowsInput {
  const fn = () => undefined;
  return {
    core: {
      workspaceStore: { kind: "store" },
      sessionsRef: ref([]),
      setSessions: fn,
      tabsRef: ref([]),
      setTabs: fn,
      activeTabIdRef: ref("t"),
      projectCwdRef: ref("/p"),
      insetLayoutRef: ref(false),
      switchingWorktrees: ref(new Map()),
      removingWorktreePaths: ref(new Set()),
      workspacePins: ref(new Map()),
      turnGen: ref(new Map()),
      setActiveTabIdState: fn,
      setComposerFocused: fn,
      setAutomationsViewOpen: fn,
      projectOfTab: fn,
      tabWorkspace: fn,
    },
    storage: {
      sessionPersistence: { kind: "persistence" },
      sessionLoader: { kind: "loader" },
      loadedSessionCache: ref(new Map()),
      openingSessionIds: ref(new Set()),
      removingSessionIds: ref(new Set()),
    },
    harness: { stopSessionForRemoval: fn },
    familiarView: { kind: "familiar" },
    navigation: { kind: "navigation" },
    selectTab: vi.fn(),
    leaveCoveringFamiliar: vi.fn(),
    sidebar: { setSidebarTab: vi.fn(), setSidebarTabSelection: vi.fn() },
    sidebarCwdRef: ref("/p"),
    gitCwdRef: ref("/p"),
    sessionDefaultsRef: ref(undefined),
    activeTabRef: ref(undefined),
    refreshHistory: vi.fn(),
  } as unknown as WorkspaceFlowsInput;
}

describe("workspaceFlowCore", () => {
  it("maps the core, storage and App callbacks onto the flow core", () => {
    const given = input();
    const flowCore = workspaceFlowCore(given);

    expect(flowCore.store).toBe(given.core.workspaceStore);
    expect(flowCore.setActiveTabId).toBe(given.core.setActiveTabIdState);
    expect(flowCore.selectTab).toBe(given.selectTab);
    expect(flowCore.persistence).toBe(given.storage.sessionPersistence);
    expect(flowCore.loader).toBe(given.storage.sessionLoader);
    expect(flowCore.removingSessionIds).toBe(given.storage.removingSessionIds);
    expect(flowCore.setSidebarTab).toBe(given.sidebar.setSidebarTab);
    expect(flowCore.stopSessionForRemoval).toBe(given.harness.stopSessionForRemoval);
    expect(flowCore.sidebarCwdRef).toBe(given.sidebarCwdRef);
    expect(flowCore.familiarView).toBe(given.familiarView);
  });
});

describe("useWorkspaceFlows", () => {
  it("runs the opening flows before the running ones and keeps the first render's flow core", () => {
    let given = input();
    const hook = mountHook(() => useWorkspaceFlows(given));
    given = input();
    hook.rerender();
    hook.unmount();

    expect(mocks.calls).toEqual(["opening", "running after opening", "opening", "running after opening"]);
    expect(new Set(mocks.cores).size).toBe(1);
    expect(hook.result.current).toEqual({ flowCore: mocks.cores[0], ...mocks.opening, ...mocks.running });
  });
});
