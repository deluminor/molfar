import { sessionWorkCwd } from "@/domain/session/session-state";
import {
  mapProjectTerminal,
  patchProjectTerminals,
  selectDockTerminal,
  withDockOpen,
} from "@/features/projects/model/project-terminal";
import { isBlankSession } from "@/features/projects/model/project-return";
import { isLocalProject } from "@/features/projects/model/recents";
import type { TerminalMetaPatch } from "@/features/terminal/model/terminal-tab";
import {
  newTerminalFile,
  newTerminalWorkspaceTab,
  nextTerminalTitle,
  openTerminalTab,
  updateTerminalTab,
  withSurfacePanes,
} from "@/features/workspace/model/layout";
import { activeWorkspaceTab } from "../../../model/active-workspace-tab";
import { focusProjectTerminal, openProjectTerminal } from "./dock-terminals";
import type { TerminalDeps } from "./terminal-deps";

/**
 * Opens a terminal in `cwd`: in the project's dock when there is one, else as
 * its own tab or a pane of the active tab, taking the place of a blank
 * conversation (`occupySessionId`, the focused one by default).
 */
export function openTerminal(
  deps: TerminalDeps,
  cwd: string,
  asWorkspaceTab = false,
  occupySessionId?: string,
): void {
  const workdir = cwd || deps.terminalCwd();
  if (!isLocalProject(deps.projectCwd()) || !isLocalProject(workdir)) return;
  if (openProjectTerminal(deps, workdir)) return;

  const sidebarCwd = deps.sidebarCwd();
  const activeTab = activeWorkspaceTab(
    deps.tabs(),
    deps.activeTabId(),
    deps.sessions(),
    deps.projectCwd(),
  );
  if (asWorkspaceTab || !activeTab) {
    const tab = newTerminalWorkspaceTab(newTerminalFile(workdir, undefined, sidebarCwd));
    deps.appendTab(tab, sidebarCwd);
    deps.selectTab(tab.id);
    deps.setComposerFocused(false);
    return;
  }

  const occupying = deps
    .sessions()
    .find((session) => session.id === (occupySessionId ?? activeTab.focusedId));
  const occupyPaneId = occupying && isBlankSession(occupying) ? occupying.id : undefined;
  if (occupyPaneId && occupying) deps.dropBlankSession(occupying);

  const file = newTerminalFile(workdir, nextTerminalTitle(activeTab, workdir), sidebarCwd);
  deps.store
    .getState()
    .setTabs((previous) =>
      previous.map((tab) => (tab.id === activeTab.id ? openTerminalTab(tab, file, occupyPaneId) : tab)),
    );
  deps.setComposerFocused(false);
}

/** A terminal in the conversation's working folder, replacing it while blank. */
export function openTerminalInSession(deps: TerminalDeps, sessionId: string): void {
  const session = deps.sessions().find((entry) => entry.id === sessionId);
  if (session?.worktreeRemoved) return;
  openTerminal(deps, session ? sessionWorkCwd(session) : deps.projectCwd(), false, sessionId);
}

/** A terminal's title, folder or foreground command changed. */
export function changeTerminalMeta(deps: TerminalDeps, fileId: string, patch: TerminalMetaPatch): void {
  const { setProjectTerminals, setTabs } = deps.store.getState();
  setProjectTerminals((previous) => patchProjectTerminals(previous, fileId, patch));
  setTabs((previous) => previous.map((tab) => updateTerminalTab(tab, fileId, patch)));
}

/**
 * The running-terminal indicator: shows or hides its dock, or brings its tab
 * pane forward; a terminal already on screen hands focus back to the composer.
 */
export function toggleRunningTerminal(deps: TerminalDeps, fileId: string): void {
  const { setProjectTerminals, setProjectTerminalFocused } = deps.store.getState();
  const dock = deps.docks().find((entry) => entry.pane.files.some((file) => file.id === fileId));
  if (dock) {
    if (dock.open) {
      setProjectTerminals((previous) =>
        mapProjectTerminal(previous, dock.projectPath, (entry) => withDockOpen(entry, false)),
      );
      setProjectTerminalFocused(false);
      return;
    }
    setProjectTerminals((previous) =>
      mapProjectTerminal(previous, dock.projectPath, (entry) =>
        withDockOpen(selectDockTerminal(entry, fileId), true),
      ),
    );
    focusProjectTerminal(deps);
    return;
  }

  for (const tab of deps.tabs()) {
    const pane = (tab.terminalPanes ?? []).find((entry) =>
      entry.files.some((file) => file.id === fileId),
    );
    if (!pane) continue;
    const showing =
      deps.activeTabId() === tab.id && tab.focusedId === pane.id && pane.activeFileId === fileId;
    if (showing) {
      deps.setComposerFocused(true);
      setProjectTerminalFocused(false);
      return;
    }

    deps.selectTab(tab.id);
    deps.store.getState().setTabs((previous) =>
      previous.map((entry) =>
        entry.id === tab.id
          ? withSurfacePanes(
              { ...entry, focusedId: pane.id },
              "terminal",
              (entry.terminalPanes ?? []).map((item) =>
                item.id === pane.id ? { ...item, activeFileId: fileId } : item,
              ),
            )
          : entry,
      ),
    );
    setProjectTerminalFocused(false);
    deps.setComposerFocused(false);
    return;
  }
}
