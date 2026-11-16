import { vi } from "vitest";
import type { Session } from "@/domain/session/session";
import {
  type FilePaneTab,
  leaf,
  newTab,
  splitPane,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../../store/create-workspace-store";
import { testWorkspaceState } from "../../../store/test-state";
import type { TabCloseDeps } from "./tab-close-deps";

/** An answered session, so its tab is never blank. */
export function session(id: string, cwd = "/work/demo"): Session {
  return {
    ...testSession("claude", cwd),
    id,
    blocks: [{ id: `${id}-u`, role: "user", text: "hi" }],
  };
}

export function file(id: string, extra: Partial<FilePaneTab> = {}): FilePaneTab {
  return { id, path: `/work/demo/${id}.ts`, cwd: "/work/demo", ...extra };
}

/** A tab with `sessionId` and, beside it, an editor pane holding `files`. */
export function tabWithFiles(
  tabId: string,
  sessionId: string,
  files: FilePaneTab[],
  paneId = `${tabId}-pane`,
): WorkspaceTab {
  return {
    ...newTab(sessionId),
    id: tabId,
    layout: splitPane(leaf(sessionId), sessionId, "right", paneId),
    editorPanes: [{ id: paneId, files, activeFileId: files[0]?.id ?? "" }],
  };
}

export function sessionTab(tabId: string, sessionId: string): WorkspaceTab {
  return { ...newTab(sessionId), id: tabId };
}

/** Workspace state in a store, with every confirmation answered by `confirm`. */
export function setupTabClose(
  sessions: Session[],
  tabs: WorkspaceTab[],
  options: { activeTabId?: string; dirty?: string[]; confirm?: boolean } = {},
) {
  const store = createWorkspaceStore(
    testWorkspaceState({
      sessions,
      tabs,
      activeTabId: options.activeTabId ?? tabs[0]?.id ?? "",
      projectCwd: "/work/demo",
      dirtyFiles: new Set(options.dirty ?? []),
    }),
  );
  const confirm = vi.fn(async () => options.confirm ?? true);
  const deps: TabCloseDeps = {
    store,
    tabs: () => store.getState().tabs,
    sessions: () => store.getState().sessions,
    activeTabId: () => store.getState().activeTabId,
    projectCwd: () => store.getState().projectCwd,
    dirtyFiles: () => store.getState().dirtyFiles,
    setSessions: (update) => store.getState().setSessions(update),
    setComposerFocused: vi.fn(),
    insetLayout: () => false,
    navigation: () => ({ tabs: [], activeId: store.getState().activeTabId }),
    tabWorkspace: () => null,
    activateTab: vi.fn((tabId: string) => store.getState().setActiveTabId(tabId)),
    persist: vi.fn(),
    refreshHistory: vi.fn(),
    closeFamiliarView: vi.fn(),
    confirmDiscardUnsaved: confirm,
    confirmCloseTerminal: confirm,
    confirmCloseTerminals: confirm,
  };

  return { store, deps, confirm, tabIds: () => store.getState().tabs.map((tab) => tab.id) };
}

/** Lets the close flows' confirmation awaits settle. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
