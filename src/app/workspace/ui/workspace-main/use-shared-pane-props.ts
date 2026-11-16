import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { sharedPaneProps } from "./shared-pane-props";
import type { SharedPaneProps } from "./types";

export function useSharedPaneProps(
  store: WorkspaceStore,
  workspaceSwitchingSessionId: string | undefined,
): SharedPaneProps {
  const handlers = useWorkspaceHandlers();
  const recents = useWorkspaceField(store, "recents");

  return sharedPaneProps(handlers, recents, workspaceSwitchingSessionId);
}
