// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createSessionPersistence } from "../session-history/session-persistence";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import {
  activateTab,
  focusOpenSession,
  paneToFocus,
  replaceBlankPaneWithSession,
  type TabFocusDeps,
} from "./tab-focus";

function session(id: string, cwd = "/work/demo", answered = true): Session {
  return {
    ...testSession("claude", cwd),
    id,
    blocks: answered ? [{ id: `${id}-u`, role: "user", text: "hi" }] : [],
  };
}

function setup(sessions: Session[], tabs: WorkspaceTab[]) {
  const store = createWorkspaceStore(
    testWorkspaceState({
      sessions,
      tabs,
      activeTabId: tabs[0]?.id ?? "",
      projectCwd: "/work/demo",
    }),
  );
  const deps: TabFocusDeps = {
    store,
    tabs: () => store.getState().tabs,
    sessions: () => store.getState().sessions,
    activeTabId: () => store.getState().activeTabId,
    projectCwd: () => store.getState().projectCwd,
    selectTab: vi.fn((tabId: string) => store.getState().setActiveTabId(tabId)),
    setComposerFocused: vi.fn(),
    cache: new Map(),
    persistence: createSessionPersistence({
      upsert: async () => null,
      isBlocked: () => false,
      onSaved: () => {},
    }),
    forgetHarness: vi.fn(),
  };
  return { deps, store };
}

beforeEach(() => {
  localStorage.clear();
});

describe("paneToFocus", () => {
  it("keeps the tab's focus unless the tab holds the requested pane", () => {
    const tab = newTab("a");

    expect(paneToFocus(tab, "a")).toBe("a");
    expect(paneToFocus(tab, "elsewhere")).toBe("a");
    expect(paneToFocus(undefined, "a")).toBeUndefined();
  });
});

describe("activateTab", () => {
  it("selects the tab, focuses its conversation and switches project", () => {
    const other = session("b", "/work/other");
    const tabs = [newTab("a"), newTab("b")];
    const { deps, store } = setup([session("a"), other], tabs);

    activateTab(deps, tabs[1].id);

    expect(deps.selectTab).toHaveBeenCalledWith(tabs[1].id, "session");
    expect(store.getState().projectCwd).toBe("/work/other");
    expect(store.getState().recents[0]?.path).toBe("/work/other");
    expect(deps.setComposerFocused).toHaveBeenCalledWith(true);
  });

  it("passes a workspace switch through", () => {
    const tabs = [newTab("a")];
    const { deps } = setup([session("a")], tabs);

    activateTab(deps, tabs[0].id, undefined, "workspace");

    expect(deps.selectTab).toHaveBeenCalledWith(tabs[0].id, "workspace");
  });
});

describe("focusOpenSession", () => {
  it("focuses the tab that holds the session", () => {
    const tabs = [newTab("a"), newTab("b")];
    const { deps, store } = setup([session("a"), session("b")], tabs);

    expect(focusOpenSession(deps, "b")).toBe(true);
    expect(store.getState().activeTabId).toBe(tabs[1].id);
  });

  it("is false for a session no tab holds", () => {
    const { deps } = setup([session("a")], [newTab("a")]);

    expect(focusOpenSession(deps, "missing")).toBe(false);
  });
});

describe("replaceBlankPaneWithSession", () => {
  it("puts the session in place of the active tab's blank pane", () => {
    const blank = session("blank", "/work/demo", false);
    const tabs = [newTab(blank.id)];
    const { deps, store } = setup([blank], tabs);
    const saved = session("saved");

    expect(replaceBlankPaneWithSession(deps, saved)).toBe(true);

    expect(store.getState().sessions.map((entry) => entry.id)).toEqual([
      "saved",
    ]);
    expect(store.getState().tabs[0]?.focusedId).toBe("saved");
    expect(deps.forgetHarness).toHaveBeenCalledWith(blank);
  });

  it("keeps a tab whose conversations are all in use", () => {
    const tabs = [newTab("a")];
    const { deps } = setup([session("a")], tabs);

    expect(replaceBlankPaneWithSession(deps, session("saved"))).toBe(false);
  });
});
