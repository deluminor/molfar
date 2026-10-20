import { describe, expect, it, vi } from "vitest";
import { newTab } from "@/features/workspace/model/layout";
import { openProjects, selectProject } from "./open-projects";
import { projectSession, setupProjects } from "./project.fixture";
import { moveProjectLocation } from "./project-location";
import { removeProject } from "./remove-project";

vi.mock("@/features/projects/model/project-data", () => ({
  removeProjectData: vi.fn(async () => undefined),
  rebaseProjectData: vi.fn(),
}));
vi.mock("@/features/sessions/data/session-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/sessions/data/session-store")>()),
  rebaseProjectSessions: vi.fn(async () => undefined),
}));
vi.mock("@/integrations/harness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/integrations/harness")>()),
  cancelHarnessTurn: vi.fn(async () => undefined),
  forgetHarnessSession: vi.fn(async () => undefined),
}));

const demo = () => projectSession("d", "/work/demo", { blocks: [{ id: "u", role: "user", text: "hi" }] });
const other = () => projectSession("o", "/work/other", { blocks: [{ id: "u", role: "user", text: "hi" }] });

describe("openProjects", () => {
  it("opens a new project in a new tab beside the current one, focused", () => {
    const { deps, store, sessions } = setupProjects([demo()], [{ ...newTab("d"), id: "t" }]);

    openProjects(deps, ["/work/other"]);

    expect(sessions().some((session) => session.cwd === "/work/other")).toBe(true);
    expect(store.getState().projectCwd).toBe("/work/other");
    expect(deps.selectTab).toHaveBeenCalled();
    expect(deps.focusComposer).toHaveBeenCalled();
    expect(deps.closeAutomations).toHaveBeenCalled();
  });

  it("leaves the views open when the picker returns nothing", () => {
    const { deps } = setupProjects([demo()], [{ ...newTab("d"), id: "t" }]);

    openProjects(deps, []);

    expect(deps.closeAutomations).not.toHaveBeenCalled();
  });

  it("selects a project through workspace navigation", () => {
    const { deps } = setupProjects([demo()], [{ ...newTab("d"), id: "t" }]);

    selectProject(deps, "/work/other");

    expect(deps.navigation.cancel).toHaveBeenCalled();
    expect(deps.navigation.selectProject).toHaveBeenCalledWith("/work/other");
  });
});

describe("removeProject", () => {
  function setup() {
    return setupProjects(
      [demo(), other()],
      [
        { ...newTab("d"), id: "td" },
        { ...newTab("o"), id: "to" },
      ],
    );
  }

  it("archives a project: saves its idle sessions and closes its tabs", () => {
    const { deps, sessions, tabs } = setup();

    removeProject(deps, "/work/other", { purgeData: false });

    expect(deps.persistence.persist).toHaveBeenCalledWith(expect.objectContaining({ id: "o" }));
    expect(deps.persistence.forgetSaved).not.toHaveBeenCalled();
    expect(sessions().map((session) => session.id)).toEqual(["d"]);
    expect(tabs().map((tab) => tab.id)).toEqual(["td"]);
  });

  it("deletes a project's saved sessions with it", () => {
    const { deps } = setup();

    removeProject(deps, "/work/other", { purgeData: true });

    expect(deps.persistence.forgetSaved).toHaveBeenCalledWith("o");
  });

  it("leaves a blank tab when the last project closes", () => {
    const { deps, tabs, store } = setupProjects([demo()], [{ ...newTab("d"), id: "td" }]);

    removeProject(deps, "/work/demo", { purgeData: false });

    expect(tabs()).toHaveLength(1);
    expect(tabs()[0].id).not.toBe("td");
    expect(store.getState().projectCwd).toBe("~");
  });
});

describe("moveProjectLocation", () => {
  it("moves sessions, history and the current project to the new path", async () => {
    const { deps, sessions, store } = setupProjects([demo()], [{ ...newTab("d"), id: "td" }]);

    await moveProjectLocation(deps, "/work/demo", "/work/moved");

    expect(sessions()[0].cwd).toBe("/work/moved");
    expect(deps.projectCwdRef.current).toBe("/work/moved");
    expect(store.getState().projectCwd).toBe("/work/moved");
    expect(deps.fileMoved).toHaveBeenCalledWith("/work/demo", "/work/moved");
  });
});
