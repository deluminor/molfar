import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { newTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { navigateSessionList, type SessionListDeps } from "./session-list-navigation";

const session = (id: string): Session => ({ ...testSession("claude", "/work/demo"), id });

function setup() {
  const tabs = [{ ...newTab("b"), id: "t" }];
  const sessions = [session("a"), session("b"), session("c")];
  const store = createWorkspaceStore(testWorkspaceState({ sessions, tabs, activeTabId: "t" }));
  const tabsRef = { current: tabs };
  store.subscribe((state) => {
    tabsRef.current = state.tabs;
  });
  const deps = {
    store,
    tabsRef,
    activeTabIdRef: { current: "t" },
    sessionsRef: { current: sessions },
    setComposerFocused: vi.fn(),
    closeFamiliarView: vi.fn(),
    closeAutomations: vi.fn(),
    cancelNavigation: vi.fn(),
    activateTab: vi.fn(),
    selectTab: vi.fn(),
    appendTab: vi.fn(),
    ensureOpenSession: vi.fn(async (id: string) => sessions.find((entry) => entry.id === id)),
    openFamiliar: vi.fn(async () => undefined),
    focusOpenSession: vi.fn(() => false),
    replaceBlankPane: vi.fn(() => false),
    linkedUpdates: () => new Map(),
    revealLinkedUpdate: vi.fn(),
    navigationIds: { current: ["a", "b", "c"] },
    selectHistorySession: vi.fn(async () => undefined),
    selectRemoteSession: vi.fn(),
    prefetch: vi.fn(),
  } satisfies SessionListDeps;
  return { deps, store };
}

describe("navigateSessionList", () => {
  it("opens the next session and warms the one after it", async () => {
    const { deps } = setup();

    navigateSessionList(deps, 1);

    expect(deps.selectHistorySession).toHaveBeenCalledWith("c");
    await vi.waitFor(() => expect(deps.prefetch).not.toHaveBeenCalledWith("b"));
  });

  it("swaps the focused pane's session in place", async () => {
    const { deps, store } = setup();

    navigateSessionList(deps, -1, true);

    await vi.waitFor(() => expect(store.getState().tabs[0].focusedId).toBe("a"));
    expect(deps.selectHistorySession).not.toHaveBeenCalled();
  });

  it("stays put at the end of the list", () => {
    const { deps } = setup();
    deps.navigationIds.current = ["b"];

    navigateSessionList(deps, 1);

    expect(deps.selectHistorySession).not.toHaveBeenCalled();
  });
});
