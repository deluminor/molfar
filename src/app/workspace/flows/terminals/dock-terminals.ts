import {
  addTerminalToDock,
  closeTerminalInDock,
  createProjectTerminal,
  type DockSide,
  findProjectTerminal,
  focusedDockTerminalId,
  mapProjectTerminal,
  nextDockTerminalTitle,
  type ProjectTerminalDock,
  reorderDockTerminals,
  selectDockTerminal,
  withDockOpen,
  withDockSide,
  withDockSize,
} from "@/features/projects/model/project-terminal";
import { isLocalProject } from "@/features/projects/model/recents";
import { newTerminalFile } from "@/features/workspace/model/layout";
import { orderByIds } from "@/shared/lib/reorder";
import type { TerminalDeps } from "./terminal-deps";

/** Moves the keyboard into the project's terminal dock. */
export function focusProjectTerminal(deps: TerminalDeps): void {
  deps.store.getState().setProjectTerminalFocused(true);
  deps.setComposerFocused(false);
}

function updateCurrentDock(
  deps: TerminalDeps,
  update: (dock: ProjectTerminalDock) => ProjectTerminalDock | null,
): void {
  deps.store
    .getState()
    .setProjectTerminals((previous) => mapProjectTerminal(previous, deps.projectCwd(), update));
}

/** Adds a terminal in `cwd` to the project's dock; false outside a local project. */
export function openProjectTerminal(deps: TerminalDeps, cwd: string): boolean {
  const projectPath = deps.projectCwd();
  const workdir = cwd || projectPath;
  if (!isLocalProject(projectPath)) return false;

  deps.store.getState().setProjectTerminals((previous) => {
    const existing = findProjectTerminal(previous, projectPath);
    const file = newTerminalFile(
      workdir,
      existing ? nextDockTerminalTitle(existing, workdir) : undefined,
      projectPath,
    );
    if (!existing) {
      return [...previous, createProjectTerminal(projectPath, file, deps.lastDockSide() ?? "bottom")];
    }
    return mapProjectTerminal(previous, projectPath, (dock) => addTerminalToDock(dock, file));
  });
  focusProjectTerminal(deps);

  return true;
}

/** Shows or hides the project's dock, starting its first terminal when it has none. */
export function toggleProjectTerminal(deps: TerminalDeps): void {
  const projectPath = deps.projectCwd();
  if (!isLocalProject(projectPath)) return;
  deps.leaveCoveringFamiliar();
  const dock = findProjectTerminal(deps.docks(), projectPath);
  if (!dock) {
    openProjectTerminal(deps, deps.terminalCwd());
    return;
  }

  const open = !dock.open;
  deps.store
    .getState()
    .setProjectTerminals((previous) =>
      mapProjectTerminal(previous, projectPath, (entry) => withDockOpen(entry, open)),
    );
  if (open) focusProjectTerminal(deps);
  else deps.store.getState().setProjectTerminalFocused(false);
}

export function hideProjectTerminal(deps: TerminalDeps): void {
  updateCurrentDock(deps, (dock) => withDockOpen(dock, false));
  deps.store.getState().setProjectTerminalFocused(false);
}

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function setProjectTerminalSide(deps: TerminalDeps, side: DockSide): void {
  deps.store.getState().setLastDockSide(side);
  updateCurrentDock(deps, (dock) => withDockSide(dock, side, viewport()));
}

export function setProjectTerminalSize(deps: TerminalDeps, size: number): void {
  updateCurrentDock(deps, (dock) => withDockSize(dock, size, viewport()));
}

export function selectProjectTerminal(deps: TerminalDeps, fileId: string): void {
  updateCurrentDock(deps, (dock) => selectDockTerminal(dock, fileId));
  focusProjectTerminal(deps);
}

export function reorderProjectTerminals(deps: TerminalDeps, ids: string[]): void {
  updateCurrentDock(deps, (dock) => reorderDockTerminals(dock, orderByIds(dock.pane.files, ids)));
}

/** Closes a dock terminal once a running process is confirmed. */
export function closeProjectTerminal(deps: TerminalDeps, fileId: string): void {
  const dock = findProjectTerminal(deps.docks(), deps.projectCwd());
  const file = dock?.pane.files.find((entry) => entry.id === fileId);
  if (!file) return;

  void deps.confirmCloseTerminal(file).then((ok) => {
    if (ok) updateCurrentDock(deps, (entry) => closeTerminalInDock(entry, fileId));
  });
}

/** Closes every other dock terminal and shows `fileId`. */
export function closeOtherProjectTerminals(deps: TerminalDeps, fileId: string): void {
  const projectPath = deps.projectCwd();
  const dock = findProjectTerminal(deps.docks(), projectPath);
  if (!dock?.pane.files.some((file) => file.id === fileId)) return;
  const closing = dock.pane.files.filter((file) => file.id !== fileId);
  if (closing.length === 0) return;
  const closingIds = new Set(closing.map((file) => file.id));

  const finish = () => {
    deps.store.getState().setProjectTerminals((previous) =>
      mapProjectTerminal(previous, projectPath, (entry) => {
        if (!entry.pane.files.some((file) => file.id === fileId)) return entry;
        const files = entry.pane.files.filter((file) => !closingIds.has(file.id));
        return { ...entry, pane: { ...entry.pane, files, activeFileId: fileId } };
      }),
    );
  };

  void deps.confirmCloseTerminals(closing).then((ok) => ok && finish());
}

/**
 * The dock terminal that ⌘T / ⌘W act on while the keyboard is in the dock.
 * DOM focus is required as well as the dock flag: the flag outlives clicks on
 * chrome that does not clear it, and the shortcuts must follow the keyboard.
 */
export function focusedDockTerminal(deps: TerminalDeps): string | null {
  const dockFocused =
    deps.store.getState().projectTerminalFocused &&
    Boolean(document.activeElement?.closest("[data-project-terminal-dock]"));
  return focusedDockTerminalId(findProjectTerminal(deps.docks(), deps.projectCwd()), dockFocused);
}
