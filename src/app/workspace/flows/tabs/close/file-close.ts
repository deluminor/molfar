import { nextDisplayedTabAfterClose } from "@/features/workspace/model/app-view-tabs";
import {
  type FilePaneTab,
  findSurfacePane,
  firstLeafId,
  isFilesystemTab,
  removePane,
  resetTabToSession,
  siblingLeafId,
  surfacePanes,
  withSurfacePanes,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import { basename } from "@/shared/lib/paths";
import type { TabCloseDeps } from "./tab-close-deps";
import { closeTab } from "./tab-close";
import {
  closePlan,
  confirmClosing,
  forgetDirty,
  seedSession,
  unsavedFiles,
} from "./tab-close-steps";

/**
 * Closes one file or terminal of a pane. The pane goes with its last file,
 * and a tab left without panes closes, or starts over when it must stay.
 */
export function closeFile(deps: TabCloseDeps, paneId: string, fileId: string): void {
  const tab = deps.tabs().find((entry) => findSurfacePane(entry, paneId));
  const found = tab ? findSurfacePane(tab, paneId) : undefined;
  if (!tab || !found) return;
  const index = found.pane.files.findIndex((file) => file.id === fileId);
  if (index < 0) return;
  const file = found.pane.files[index];
  const unsaved = isFilesystemTab(file) && deps.dirtyFiles().has(fileId);

  void (async () => {
    if (unsaved && !(await deps.confirmDiscardUnsaved(`Close ${basename(file.path)} without saving?`)))
      return;
    if (file.terminal && !(await deps.confirmCloseTerminal(file))) return;
    finishFileClose(deps, tab, found, index);
  })();
}

function finishFileClose(
  deps: TabCloseDeps,
  tab: WorkspaceTab,
  { kind, pane }: NonNullable<ReturnType<typeof findSurfacePane>>,
  index: number,
): void {
  const file = pane.files[index];
  const files = pane.files.filter((entry) => entry.id !== file.id);
  let nextFocus = tab.focusedId;
  let nextLayout = tab.layout;
  let nextPanes = surfacePanes(tab, kind);

  if (files.length > 0) {
    nextFocus = pane.id;
    const activeFileId =
      pane.activeFileId === file.id ? files[Math.min(index, files.length - 1)].id : pane.activeFileId;
    nextPanes = nextPanes.map((entry) =>
      entry.id === pane.id ? { ...entry, files, activeFileId } : entry,
    );
  } else {
    const sibling = siblingLeafId(tab.layout, pane.id);
    const withoutPane = removePane(tab.layout, pane.id);
    if (!withoutPane) {
      closeLastPane(deps, tab, file);
      return;
    }
    nextLayout = withoutPane;
    nextFocus = tab.focusedId === pane.id ? (sibling ?? firstLeafId(withoutPane)) : tab.focusedId;
    nextPanes = nextPanes.filter((entry) => entry.id !== pane.id);
  }

  deps.store
    .getState()
    .setTabs((previous) =>
      previous.map((entry) =>
        entry.id === tab.id
          ? withSurfacePanes({ ...entry, layout: nextLayout, focusedId: nextFocus }, kind, nextPanes)
          : entry,
      ),
    );
  forgetDirty(deps, [file.id]);
  if (tab.id === deps.activeTabId() && files.length === 0) {
    deps.setComposerFocused(deps.sessions().some((session) => session.id === nextFocus));
  }
}

/** The tab's only pane closed: close the tab, or start it over on a blank session. */
function closeLastPane(deps: TabCloseDeps, tab: WorkspaceTab, file: FilePaneTab): void {
  forgetDirty(deps, [file.id]);
  if (closePlan(deps, tab.id).action === "close") {
    closeTab(deps, tab.id, file.terminal ? { confirmedTerminalIds: [file.id] } : undefined);
    return;
  }

  const session = seedSession(deps, file.cwd || deps.projectCwd());
  deps.setSessions((previous) => [...previous, session]);
  deps.store
    .getState()
    .setTabs((previous) =>
      previous.map((entry) => (entry.id === tab.id ? resetTabToSession(entry, session.id) : entry)),
    );
  deps.setComposerFocused(true);
  const navigation = deps.navigation();
  const nextId = nextDisplayedTabAfterClose(navigation.tabs, navigation.activeId, tab.id);
  if (nextId) navigation.select?.(nextId);
}

/** Closes every other file in the pane and shows `fileId`. */
export function closeOtherFiles(deps: TabCloseDeps, paneId: string, fileId: string): void {
  const tab = deps.tabs().find((entry) => findSurfacePane(entry, paneId));
  const found = tab ? findSurfacePane(tab, paneId) : undefined;
  if (!tab || !found?.pane.files.some((file) => file.id === fileId)) return;
  const closing = found.pane.files.filter((file) => file.id !== fileId);
  if (closing.length === 0) return;
  const closingIds = new Set(closing.map((file) => file.id));

  const finish = () => {
    deps.store.getState().setTabs((previous) =>
      previous.map((entry) => {
        if (entry.id !== tab.id) return entry;
        const current = findSurfacePane(entry, paneId);
        if (!current?.pane.files.some((file) => file.id === fileId)) return entry;
        return withSurfacePanes(
          { ...entry, focusedId: paneId },
          current.kind,
          surfacePanes(entry, current.kind).map((pane) =>
            pane.id === paneId
              ? {
                  ...pane,
                  files: pane.files.filter((file) => !closingIds.has(file.id)),
                  activeFileId: fileId,
                }
              : pane,
          ),
        );
      }),
    );
    forgetDirty(deps, closingIds);
  };

  void (async () => {
    const unsaved = unsavedFiles(deps, closing);
    const terminals = closing.filter((file) => file.terminal);
    if (await confirmClosing(deps, unsaved, terminals, "Close other tabs with unsaved files?"))
      finish();
  })();
}
