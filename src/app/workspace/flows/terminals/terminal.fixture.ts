import { vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { TerminalDeps } from "./terminal-deps";

/** Workspace state in a store for the terminal flows, in project `/work/demo`. */
export function setupTerminals(
  options: { sessions?: Session[]; tabs?: WorkspaceTab[]; confirm?: boolean; projectCwd?: string } = {},
) {
  const tabs = options.tabs ?? [];
  const store = createWorkspaceStore(
    testWorkspaceState({
      sessions: options.sessions ?? [],
      tabs,
      activeTabId: tabs[0]?.id ?? "",
      projectCwd: options.projectCwd ?? "/work/demo",
    }),
  );
  const confirm = vi.fn(async () => options.confirm ?? true);
  const deps: TerminalDeps = {
    store,
    projectCwd: () => store.getState().projectCwd,
    sidebarCwd: () => store.getState().projectCwd,
    terminalCwd: () => "/work/demo/src",
    docks: () => store.getState().projectTerminals,
    lastDockSide: () => store.getState().lastDockSide,
    tabs: () => store.getState().tabs,
    sessions: () => store.getState().sessions,
    activeTabId: () => store.getState().activeTabId,
    setComposerFocused: vi.fn(),
    selectTab: vi.fn((tabId: string) => store.getState().setActiveTabId(tabId)),
    appendTab: vi.fn((tab: WorkspaceTab) => store.getState().setTabs((previous) => [...previous, tab])),
    leaveCoveringFamiliar: vi.fn(),
    dropBlankSession: vi.fn(),
    confirmCloseTerminal: confirm,
    confirmCloseTerminals: confirm,
  };

  const dock = () => store.getState().projectTerminals[0];
  return { store, deps, confirm, dock };
}

export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
