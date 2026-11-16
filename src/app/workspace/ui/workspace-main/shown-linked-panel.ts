import { leafIds, type WorkspaceTab } from "@/features/workspace/model/layout";
import type { LinkedWorkItemPanelState } from "../../store/surfaces-slice";

/** The session whose work item panel the tab shows: the focused pane's, else the latest panel opened in the tab. */
export function shownLinkedPanelSessionId(
  panels: ReadonlyMap<string, LinkedWorkItemPanelState>,
  activeTab: WorkspaceTab | undefined,
): string | undefined {
  if (!activeTab) return undefined;
  const sessionIds = leafIds(activeTab.layout);
  const panel =
    panels.get(activeTab.focusedId) ??
    [...panels.values()].reverse().find((entry) => sessionIds.includes(entry.sessionId));
  return panel?.sessionId;
}
