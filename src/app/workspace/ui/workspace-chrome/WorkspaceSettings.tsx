import type { ComponentProps } from "react";
import { useWorkspaceActions } from "../../hooks/use-workspace-actions";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { SettingsView } from "../app-views/lazy-views";

type Props = Omit<
  ComponentProps<typeof SettingsView>,
  | "section"
  | "anchor"
  | "notificationProjectPath"
  | "notificationSettingsRequest"
  | "recents"
  | "besideRail"
  | "onDeleteProject"
  | "collapsedProjectRailMode"
  | "onCollapsedProjectRailModeChange"
> & {
  store: WorkspaceStore;
  onRemoveProject: (path: string, options: { purgeData: boolean }) => void;
};

/** Settings over the workspace while open, with its section and rail mode read from the store. */
export function WorkspaceSettings({ store, onRemoveProject, ...settingsProps }: Props) {
  const settingsOpen = useWorkspaceField(store, "settingsOpen");
  const section = useWorkspaceField(store, "settingsSection");
  const anchor = useWorkspaceField(store, "settingsAnchor");
  const notificationProjectPath = useWorkspaceField(store, "notificationProjectPath");
  const notificationSettingsRequest = useWorkspaceField(store, "notificationSettingsRequest");
  const recents = useWorkspaceField(store, "recents");
  const collapsedProjectRailMode = useWorkspaceField(store, "collapsedProjectRailMode");
  const { setCollapsedProjectRailMode } = useWorkspaceActions(store);

  if (!settingsOpen) return null;

  const onDeleteProject = (path: string) => onRemoveProject(path, { purgeData: true });

  return (
    <SettingsView
      {...settingsProps}
      section={section}
      anchor={anchor}
      notificationProjectPath={notificationProjectPath}
      notificationSettingsRequest={notificationSettingsRequest}
      recents={recents}
      besideRail
      onDeleteProject={onDeleteProject}
      collapsedProjectRailMode={collapsedProjectRailMode}
      onCollapsedProjectRailModeChange={setCollapsedProjectRailMode}
    />
  );
}
