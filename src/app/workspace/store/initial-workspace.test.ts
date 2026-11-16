// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { rememberProject } from "@/features/projects/model/recents";
import { newSession } from "@/features/sessions/model/session";
import { saveSettingsSection } from "@/features/settings/model/settings";
import { newTab } from "@/features/workspace/model/layout";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { initialWorkspaceState } from "./initial-workspace";

beforeEach(() => {
  localStorage.clear();
});

describe("initialWorkspaceState", () => {
  it("opens one blank session in one tab in the last project", () => {
    rememberProject("/work/demo");

    const state = initialWorkspaceState({
      windowTransfer: null,
      resumed: null,
      history: [],
      historyCwd: null,
      installedUpdate: null,
    });

    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]).toMatchObject({ cwd: "/work/demo", blocks: [] });
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0]?.focusedId).toBe(state.sessions[0]?.id);
    expect(state.activeTabId).toBe(state.tabs[0]?.id);
    expect(state.tabVisitNav).toEqual({ canBack: false, canForward: false });
    expect(state).toMatchObject({
      projectTerminals: [],
      lastDockSide: null,
      projectTerminalFocused: false,
      filePickerOpen: false,
      editorNavigation: null,
    });
    expect(state.dirtyFiles.size).toBe(0);
  });

  it("takes a resumed workspace and reopens its project", () => {
    rememberProject("/work/last");
    const session = newSession("claude", "/work/resumed");
    const tab = newTab(session.id);

    const state = initialWorkspaceState({
      windowTransfer: null,
      resumed: {
        sessions: [session],
        tabs: [tab],
        activeTabId: tab.id,
        projectCwd: "/work/resumed",
        lastDockSide: "right",
      },
      history: [],
      historyCwd: null,
      installedUpdate: null,
    });

    expect(state.projectCwd).toBe("/work/resumed");
    expect(state.sessions).toEqual([session]);
    expect(state.tabs).toEqual([tab]);
    expect(state.activeTabId).toBe(tab.id);
    expect(state.lastDockSide).toBe("right");
  });

  it("takes a transferred window's sessions and tabs as they are", () => {
    const session = newSession("claude", "/work/moved");
    const tab = newTab(session.id);

    const state = initialWorkspaceState({
      windowTransfer: {
        sessions: [session],
        tabs: [tab],
        activeTabId: tab.id,
        projectCwd: "/work/moved",
        dirtyFileIds: ["file:/work/moved/a.ts"],
      },
      resumed: null,
      history: [],
      historyCwd: null,
      installedUpdate: null,
    });

    expect(state.sessions).toEqual([session]);
    expect(state.tabs).toEqual([tab]);
    expect(state.activeTabId).toBe(tab.id);
    expect([...state.dirtyFiles]).toEqual(["file:/work/moved/a.ts"]);
  });

  it("lists the boot history and marks its project as loaded", () => {
    const plain = summary("plain");
    const linked = {
      ...summary("linked"),
      linkedWorkItem: {
        kind: "issue" as const,
        repo: "acme/app",
        number: 7,
        url: "https://github.com/acme/app/issues/7",
      },
    };

    const state = initialWorkspaceState({
      windowTransfer: null,
      resumed: null,
      history: [plain, linked],
      historyCwd: "/work/demo/",
      installedUpdate: null,
    });

    expect(state.history).toEqual([plain, linked]);
    expect(state.storedLinkedSessions).toEqual([linked]);
    expect([...state.loadedProjects]).toEqual(["/work/demo"]);
    expect(state.historyErrorCwd).toBeNull();
  });

  it("opens with every surface closed and the last settings section", () => {
    saveSettingsSection("appearance");

    const state = initialWorkspaceState({
      windowTransfer: null,
      resumed: null,
      history: [],
      historyCwd: null,
      installedUpdate: null,
    });

    expect(state).toMatchObject({
      searchViewOpen: false,
      inboxViewOpen: false,
      notesViewOpen: false,
      settingsOpen: false,
      settingsSection: "appearance",
      inspectedWorkerId: null,
      workerDetailRequest: null,
    });
    expect(state.linkedWorkItemPanels.size).toBe(0);
  });

  it("announces an installed update and opens with no dialog", () => {
    const state = initialWorkspaceState({
      windowTransfer: null,
      resumed: null,
      history: [],
      historyCwd: null,
      installedUpdate: { version: "1.0.1" },
    });

    expect(state).toMatchObject({
      updateNotice: { version: "1.0.1" },
      whatsNewVersion: null,
      providerSignInRequest: null,
      sessionDeleteDialog: undefined,
      remoteProjectDialogOpen: false,
    });
  });
});

function summary(id: string): SessionSummary {
  return {
    id,
    cwd: "/work/demo",
    harness: "claude",
    model: "claude:sonnet-5",
    runtimeMode: "supervised",
    title: id,
    createdAt: 1,
    updatedAt: 1,
  };
}
