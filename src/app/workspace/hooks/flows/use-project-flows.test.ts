import { describe, expect, it, vi } from "vitest";
import type { ProjectTerminalDock } from "@/features/projects/model/project-terminal";
import type { SessionPersistence } from "../../flows/session-history/session-persistence";
import { fakeFlowCore } from "./flow-core.fixture";
import { createProjectFlows } from "./use-project-flows";
import { createTabFlows } from "./use-tab-flows";

vi.mock("@/features/sessions/data/session-store", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  rebaseProjectSessions: vi.fn(async () => undefined),
}));
vi.mock("@/features/inbox/model/ci-repair-tracking", () => ({ rebaseCiRepairs: vi.fn() }));
vi.mock("@/features/projects/model/project-data", () => ({ rebaseProjectData: vi.fn() }));
vi.mock("@/features/files/model/file-tree", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  notifyDirsChanged: vi.fn(),
}));

describe("createProjectFlows", () => {
  it("moves a project folder through the Workspace's refs and rebases open files", async () => {
    const core = fakeFlowCore({ projectCwd: "/work/old" });
    core.persistence = { mapPending: vi.fn() } as unknown as SessionPersistence;
    const dock = { projectPath: "/work/old" } as ProjectTerminalDock;
    const projectTerminalsRef = { current: [dock] };
    const tabFlows = createTabFlows(core, {
      terminalCwdRef: { current: "~" },
      displayedTabNavigation: { current: { tabs: [], activeId: "" } },
    });
    const flows = createProjectFlows(core, {
      tabFlows,
      worktreeActions: { changeProject: vi.fn() },
      projectTerminalsRef,
      setSidebarTabSelection: vi.fn(),
      readProjectReturnMemory: () => new Map(),
      editorNavigationToken: { current: 0 },
    });
    const moved = vi.spyOn(flows.fileActions, "moved").mockImplementation(() => undefined);

    await flows.projectActions.moveLocation("/work/old", "/work/new");

    expect(core.projectCwdRef.current).toBe("/work/new");
    expect(projectTerminalsRef.current[0]?.projectPath).toBe("/work/new");
    expect(core.store.getState().projectTerminals).toBe(projectTerminalsRef.current);
    expect(moved).toHaveBeenCalledWith("/work/old", "/work/new");
  });
});
