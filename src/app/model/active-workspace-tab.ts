import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { filterTabsForProject } from "@/features/workspace/model/workspace-tab-groups";

/** The tab Workspace shows; a stale id falls back within the project, never to another project's tab. */
export function activeWorkspaceTab(
  tabs: WorkspaceTab[],
  activeTabId: string,
  sessions: Session[],
  projectCwd: string,
): WorkspaceTab | undefined {
  return (
    tabs.find((tab) => tab.id === activeTabId) ??
    filterTabsForProject(tabs, sessions, projectCwd)[0] ??
    tabs[0]
  );
}
