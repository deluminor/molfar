import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { activateTab, type TabFocusDeps, type TabSelectReason } from "./tab-focus";
import { appendTab, insertBeside, insertBesideActive, openSessionTab, type TabLayoutDeps } from "./tab-layout";

/** Tab activation and placement bound to the workspace, created once. */
export function createTabLayoutActions(deps: { focus: TabFocusDeps; layout: TabLayoutDeps }) {
  const { focus, layout } = deps;
  return {
    activate: (tabId: string, paneId?: string, reason?: TabSelectReason) => activateTab(focus, tabId, paneId, reason),
    /** `cwd` scopes group inheritance: a tab from another project starts alone. */
    insertBeside: (prev: WorkspaceTab[], tab: WorkspaceTab, anchorId: string | undefined, cwd?: string) =>
      insertBeside(layout, prev, tab, anchorId, cwd),
    insertBesideActive: (prev: WorkspaceTab[], tab: WorkspaceTab, cwd?: string) =>
      insertBesideActive(layout, prev, tab, cwd),
    append: (tab: WorkspaceTab, cwd?: string) => appendTab(layout, tab, cwd),
    openSessionTab: (session: Session, cwd: string) => openSessionTab(layout, session, cwd),
  };
}

export type TabLayoutActions = ReturnType<typeof createTabLayoutActions>;
