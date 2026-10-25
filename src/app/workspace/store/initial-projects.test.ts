// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { rememberProject } from "@/features/projects/model/recents";
import type { ResumedWorkspace } from "@/features/sessions/model/in-flight";
import type { WindowTransferPayload } from "../../model/window-transfer";
import { initialProjectsState } from "./initial-projects";

function resumedAt(projectCwd: string): ResumedWorkspace {
  return { sessions: [], tabs: [], activeTabId: "", projectCwd };
}

function transferredAt(projectCwd: string): WindowTransferPayload {
  return {
    sessions: [],
    tabs: [],
    activeTabId: "",
    projectCwd,
    dirtyFileIds: [],
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("initialProjectsState", () => {
  it("opens home when no project was ever opened", () => {
    expect(
      initialProjectsState({ windowTransfer: null, resumed: null }),
    ).toEqual({ projectCwd: "~", recents: [] });
  });

  it("reopens the last opened project", () => {
    rememberProject("/work/old");
    rememberProject("/work/last");

    const state = initialProjectsState({ windowTransfer: null, resumed: null });

    expect(state.projectCwd).toBe("/work/last");
    expect(state.recents.map((recent) => recent.path)).toEqual([
      "/work/last",
      "/work/old",
    ]);
  });

  it("prefers a resumed project and moves it to the front of the recents", () => {
    rememberProject("/work/resumed");
    rememberProject("/work/last");

    const state = initialProjectsState({
      windowTransfer: null,
      resumed: resumedAt("/work/resumed"),
    });

    expect(state.projectCwd).toBe("/work/resumed");
    expect(state.recents[0]?.path).toBe("/work/resumed");
  });

  it("prefers a transferred window's project over a resumed one", () => {
    const state = initialProjectsState({
      windowTransfer: transferredAt("/work/moved"),
      resumed: resumedAt("/work/resumed"),
    });

    expect(state.projectCwd).toBe("/work/moved");
  });
});
