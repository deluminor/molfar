import type { ComponentProps } from "react";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { LinkedWorkItemPanel } from "../app-views/lazy-views";

type Props = Pick<ComponentProps<typeof LinkedWorkItemPanel>, "repairSessions"> & {
  store: WorkspaceStore;
  /** The session whose panel shows; none while a view or Familiar covers the workspace. */
  shownSessionId: string | undefined;
};

/** The work item panels of open sessions, kept mounted while their tab stays open. */
export function LinkedWorkItemPanels({ store, shownSessionId, ...panelProps }: Props) {
  const { inbox, linkedPanels } = useWorkspaceHandlers();
  const linkedWorkItemPanels = useWorkspaceField(store, "linkedWorkItemPanels");
  const recents = useWorkspaceField(store, "recents");

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
