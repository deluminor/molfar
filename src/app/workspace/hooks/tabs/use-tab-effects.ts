import { useEffect } from "react";
import { isolateTerminalPanes, type WorkspaceTab } from "@/features/workspace/model/layout";
import type { TabVisits } from "../../flows/tabs/tab-visits";
import type { WorkspaceStore } from "../../store/types";
import { useWorkspaceActions } from "../use-workspace-actions";

/** Moves terminal tabs out of file panes whenever the tabs change, so the two never share a tab strip. */
export function useIsolatedTerminalPanes(store: WorkspaceStore, tabs: WorkspaceTab[]): void {
  const { setTabs } = useWorkspaceActions(store);

  useEffect(() => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((tab) => {
        const isolated = isolateTerminalPanes(tab);
        if (isolated !== tab) changed = true;
        return isolated;
      });
      return changed ? next : prev;
    });
  }, [tabs]);
}

/** Records each tab activation for Back / Forward. */
export function useTabVisitsSync(
  tabVisits: Pick<TabVisits, "sync">,
  tabs: WorkspaceTab[],
  activeTabId: string,
): void {
  useEffect(() => {
    tabVisits.sync(new Set(tabs.map((tab) => tab.id)), activeTabId);
  }, [activeTabId, tabs, tabVisits]);
}
