import type { ComponentProps } from "react";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { LinkedWorkItemPanel } from "../app-views/lazy-views";
import { shownLinkedPanelSessionId } from "./shown-linked-panel";

type Props = Pick<ComponentProps<typeof LinkedWorkItemPanel>, "repairSessions"> & {
  store: WorkspaceStore;
  activeTab: WorkspaceTab | undefined;
  /** A view or Familiar covers the workspace, so no panel shows. */
  covered: boolean;
};

/** The work item panels of open sessions, kept mounted while their tab stays open. */
export function LinkedWorkItemPanels({ store, activeTab, covered, ...panelProps }: Props) {
  const { inbox, linkedPanels } = useWorkspaceHandlers();
  const linkedWorkItemPanels = useWorkspaceField(store, "linkedWorkItemPanels");
  const recents = useWorkspaceField(store, "recents");
  const shownSessionId = covered ? undefined : shownLinkedPanelSessionId(linkedWorkItemPanels, activeTab);

  return [...linkedWorkItemPanels.values()].map((panel) => (
    <LinkedWorkItemPanel
      {...panelProps}
      onRepairChecks={inbox.repairChecks}
      onOpenSession={(sessionId) => {
        linkedPanels.close(panel.sessionId);
        inbox.openSession(sessionId);
      }}
      key={panel.sessionId}
      target={panel.item}
      cwd={panel.cwd}
      recents={recents}
      visible={shownSessionId === panel.sessionId}
      onClose={() => linkedPanels.close(panel.sessionId)}
    />
  ));
}
