import { beforeEach, describe, expect, it, vi } from "vitest";
import { newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { openDiff, type OpenDiffDeps } from "./open-diff";

const mocks = vi.hoisted(() => ({
  viewer: vi.fn(() => "unified"),
  remember: vi.fn(),
  resolve: vi.fn(async (_cwd: string, path: string) => `${path}.resolved`),
}));

vi.mock("@/features/settings/model/settings", () => ({ loadDiffViewer: mocks.viewer }));
vi.mock("@/features/files/model/file-index", () => ({
  rememberOpenedFile: mocks.remember,
  resolveOpenablePath: mocks.resolve,
}));

function setup() {
  const session = { ...testSession("claude", "/work/demo"), id: "s" };
  const tabs: WorkspaceTab[] = [
    { ...newTab("s"), id: "active" },
    { ...newTab("o"), id: "other" },
  ];
  const store = createWorkspaceStore(testWorkspaceState({ sessions: [session], tabs }));
  const deps = {
    store,
    sessionsRef: { current: [session] },
    activeTabIdRef: { current: "active" },
    gitCwd: () => "/work/demo",
    sidebarCwd: () => "/work/demo",
    setComposerFocused: vi.fn(),
    setSidebarTab: vi.fn(),
  } satisfies OpenDiffDeps;
  return { deps, store };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer.mockReturnValue("unified");
});

describe("openDiff", () => {
  it("opens the changes view only in the active tab and shows the Changes panel", async () => {
    const { deps, store } = setup();

    await openDiff(deps, "a.ts");

    const [active, other] = store.getState().tabs;
    expect(active.editorPanes.length).toBeGreaterThan(0);
    expect(other.editorPanes).toHaveLength(0);
    expect(deps.setSidebarTab).toHaveBeenCalledWith("changes", "/work/demo");
    expect(deps.setComposerFocused).toHaveBeenCalledWith(false);
  });

  it("resolves the path unless it is exact", async () => {
    const { deps } = setup();

    await openDiff(deps, "a.ts");
    expect(mocks.remember).toHaveBeenLastCalledWith("/work/demo", "a.ts.resolved");

    await openDiff(deps, "b.ts", { exact: true });
    expect(mocks.remember).toHaveBeenLastCalledWith("/work/demo", "b.ts");
  });

  it("uses the session's own folder for session changes", async () => {
    const { deps } = setup();

    await openDiff(deps, undefined, { session: { sessionId: "s", cwd: "/work/wt" } });

    expect(mocks.remember).not.toHaveBeenCalled();
    expect(deps.setSidebarTab).toHaveBeenCalledWith("changes", "/work/demo");
  });

  it("leaves the tab alone with no path in the editor viewer", async () => {
    mocks.viewer.mockReturnValue("split");
    const { deps, store } = setup();

    await openDiff(deps, undefined);

    expect(store.getState().tabs[0].editorPanes).toHaveLength(0);
  });
});
