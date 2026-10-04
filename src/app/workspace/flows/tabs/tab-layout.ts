import type { Session } from "@/domain/session/session";
import {
  findSurfacePane,
  leafIds,
  movePane,
  newTab,
  type PaneEdge,
  type SplitDir,
  splitPane,
  surfacePanes,
  withSurfacePanes,
  type WorkspaceTab,
} from "@/features/workspace/model/layout";
import {
  applyGroupedReorder,
  insertTabBesideActive,
} from "@/features/workspace/model/tab-groups";
import { projectName } from "@/shared/lib/paths";
import { mergeOrderedSubset, orderByIds } from "@/shared/lib/reorder";
import type { WorkspaceStore } from "../../store/types";

export type TabLayoutDeps = {
  store: WorkspaceStore;
  /** The active tab as Workspace last published it. */
  activeTabId(): string;
  /** Project name of a rendered title tab. */
  projectOfTab(tabId: string): string | undefined;
};

/** Puts `tab` after `anchorId`, joining its group when the tab's project may. */
export function insertBeside(
  deps: TabLayoutDeps,
  tabs: WorkspaceTab[],
  tab: WorkspaceTab,
  anchorId: string | undefined,
  cwd?: string,
): WorkspaceTab[] {
  return insertTabBesideActive(tabs, tab, anchorId, (id) => {
    if (id !== tab.id) return deps.projectOfTab(id);
    return cwd ? projectName(cwd) : undefined;
  });
}

export function insertBesideActive(
  deps: TabLayoutDeps,
  tabs: WorkspaceTab[],
  tab: WorkspaceTab,
  cwd?: string,
): WorkspaceTab[] {
  return insertBeside(deps, tabs, tab, deps.activeTabId(), cwd);
}

export function appendTab(
  deps: TabLayoutDeps,
  tab: WorkspaceTab,
  cwd?: string,
): void {
  deps.store
    .getState()
    .setTabs((previous) => insertBesideActive(deps, previous, tab, cwd));
}

/** Adds `session` and opens it in a new tab beside the active one. */
export function openSessionTab(
  deps: TabLayoutDeps,
  session: Session,
  cwd: string,
): WorkspaceTab {
  const tab = newTab(session.id);

  deps.store.getState().setSessions((previous) => [...previous, session]);
  appendTab(deps, tab, cwd);

  return tab;
}

/** Splits the tab's focused pane and focuses `session` in the new half. */
export function splitFocusedPane(
  store: WorkspaceStore,
  tabId: string,
  dir: SplitDir,
  session: Session,
): void {
  const { setSessions, setTabs } = store.getState();

  setSessions((previous) => [...previous, session]);
  setTabs((previous) =>
    previous.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        layout: splitPane(tab.layout, tab.focusedId, dir, session.id),
        focusedId: session.id,
      };
    }),
  );
}

/**
 * Orders the visible tabs as `ids`. With `movedId` a drop inside a group joins
 * it and a drag out of one leaves it.
 */
export function reorderTabs(
  deps: TabLayoutDeps,
  ids: string[],
  movedId?: string,
): void {
  deps.store.getState().setTabs((previous) => {
    const visibleIds = new Set(ids);
    const visibleTabs = previous.filter((tab) => visibleIds.has(tab.id));
    if (!movedId) {
      return mergeOrderedSubset(previous, orderByIds(visibleTabs, ids));
    }

    const reordered = applyGroupedReorder(
      visibleTabs,
      ids,
      movedId,
      deps.projectOfTab,
    );
    return reordered ? mergeOrderedSubset(previous, reordered) : previous;
  });
}

export function reorderPaneFiles(
  store: WorkspaceStore,
  paneId: string,
  ids: string[],
): void {
  store.getState().setTabs((previous) =>
    previous.map((tab) => {
      const found = findSurfacePane(tab, paneId);
      if (!found) return tab;

      return withSurfacePanes(
        tab,
        found.kind,
        surfacePanes(tab, found.kind).map((pane) =>
          pane.id === paneId
            ? { ...pane, files: orderByIds(pane.files, ids) }
            : pane,
        ),
      );
    }),
  );
}

/** Docks pane `fromId` at `edge` of pane `toId` and focuses it. */
export function movePaneTo(
  store: WorkspaceStore,
  fromId: string,
  toId: string,
  edge: PaneEdge,
): void {
  store.getState().setTabs((previous) =>
    previous.map((tab) =>
      leafIds(tab.layout).includes(fromId)
        ? {
            ...tab,
            layout: movePane(tab.layout, fromId, toId, edge),
            focusedId: fromId,
          }
        : tab,
    ),
  );
}
