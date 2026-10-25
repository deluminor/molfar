import { useCallback, useState } from "react";
import type { RightPanelTab, SidebarTabId } from "@/features/settings/model/appearance";
import {
  loadProjectSidebarTab,
  saveProjectSidebarTab,
} from "@/features/settings/model/project-sidebar-tab";
import { pathKey } from "@/shared/lib/paths";

export type SidebarTabSelection = { project: string; tab: SidebarTabId };

/** The sidebar tab each project remembers; under the inset layout Explorer and Changes open in the right panel. */
export function useSidebarTab(
  sidebarCwd: string,
  sidebarCwdRef: { readonly current: string },
  insetLayoutRef: { readonly current: boolean },
  showRightPanel: (tab: RightPanelTab) => void,
) {
  const [sidebarTabSelection, setSidebarTabSelection] = useState<SidebarTabSelection>(() => ({
    project: pathKey(sidebarCwd),
    tab: loadProjectSidebarTab(sidebarCwd),
  }));
  const sidebarTab =
    sidebarTabSelection.project === pathKey(sidebarCwd)
      ? sidebarTabSelection.tab
      : loadProjectSidebarTab(sidebarCwd);
  const setSidebarTab = useCallback(
    (tab: SidebarTabId, project?: string) => {
      if (insetLayoutRef.current && (tab === "files" || tab === "changes")) {
        showRightPanel(tab);
        return;
      }
      const cwd = project ?? sidebarCwdRef.current;
      saveProjectSidebarTab(cwd, tab);
      setSidebarTabSelection({
        project: pathKey(cwd),
        tab: tab === "inbox" ? "sessions" : tab,
      });
    },
    [showRightPanel, insetLayoutRef, sidebarCwdRef],
  );

  return { sidebarTab, setSidebarTab, setSidebarTabSelection };
}
