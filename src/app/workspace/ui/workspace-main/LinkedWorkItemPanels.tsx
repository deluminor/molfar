import type { ComponentProps } from "react";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { LinkedWorkItemPanel } from "../app-views/lazy-views";

type Props = Pick<ComponentProps<typeof LinkedWorkItemPanel>, "repairSessions" | "onRepairChecks"> & {
  store: WorkspaceStore;
  /** The session whose panel shows; none while a view or Familiar covers the workspace. */
  shownSessionId: string | undefined;
  onClosePanel: (sessionId: string) => void;
  onOpenSession: (sessionId: string) => void;
};

/** The work item panels of open sessions, kept mounted while their tab stays open. */
export function LinkedWorkItemPanels({
  store,
  shownSessionId,
  onClosePanel,
  onOpenSession,
  ...panelProps
}: Props) {
  const linkedWorkItemPanels = useWorkspaceField(store, "linkedWorkItemPanels");
  const recents = useWorkspaceField(store, "recents");

  return [...linkedWorkItemPanels.values()].map((panel) => (
    <LinkedWorkItemPanel
      {...panelProps}
      onOpenSession={(sessionId) => {
        onClosePanel(panel.sessionId);
        onOpenSession(sessionId);
      }}
      key={panel.sessionId}
      target={panel.item}
      cwd={panel.cwd}
      recents={recents}
      visible={shownSessionId === panel.sessionId}
      onClose={() => onClosePanel(panel.sessionId)}
    />
  ));
}
