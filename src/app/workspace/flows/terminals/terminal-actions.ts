import type { DockSide } from "@/features/projects/model/project-terminal";
import type { TerminalMetaPatch } from "@/features/terminal/model/terminal-tab";
import {
  closeOtherProjectTerminals,
  closeProjectTerminal,
  focusedDockTerminal,
  focusProjectTerminal,
  hideProjectTerminal,
  reorderProjectTerminals,
  selectProjectTerminal,
  setProjectTerminalSide,
  setProjectTerminalSize,
  toggleProjectTerminal,
} from "./dock-terminals";
import type { TerminalDeps } from "./terminal-deps";
import {
  changeTerminalMeta,
  openTerminal,
  openTerminalInSession,
  toggleRunningTerminal,
} from "./workspace-terminals";

/** The terminal flows bound to `deps`, created once for the workspace. */
export function createTerminalActions(deps: TerminalDeps) {
  return {
    focusDock: () => focusProjectTerminal(deps),
    focusedDockTerminal: () => focusedDockTerminal(deps),
    open: (cwd: string, asWorkspaceTab = false, occupySessionId?: string) =>
      openTerminal(deps, cwd, asWorkspaceTab, occupySessionId),
    openNew: () => openTerminal(deps, ""),
    openNewTab: () => openTerminal(deps, "", true),
    openInSession: (sessionId: string) => openTerminalInSession(deps, sessionId),
    toggleDock: () => toggleProjectTerminal(deps),
    hideDock: () => hideProjectTerminal(deps),
    setDockSide: (side: DockSide) => setProjectTerminalSide(deps, side),
    setDockSize: (size: number) => setProjectTerminalSize(deps, size),
    select: (fileId: string) => selectProjectTerminal(deps, fileId),
    reorder: (ids: string[]) => reorderProjectTerminals(deps, ids),
    close: (fileId: string) => closeProjectTerminal(deps, fileId),
    closeOthers: (fileId: string) => closeOtherProjectTerminals(deps, fileId),
    changeMeta: (fileId: string, patch: TerminalMetaPatch) => changeTerminalMeta(deps, fileId, patch),
    toggleRunning: (fileId: string) => toggleRunningTerminal(deps, fileId),
  };
}

export type TerminalActions = ReturnType<typeof createTerminalActions>;
