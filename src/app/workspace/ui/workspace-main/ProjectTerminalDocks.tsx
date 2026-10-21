import type { ComponentProps } from "react";
import { sameProjectPath } from "@/features/projects/model/recents";
import { ProjectTerminalDock } from "@/features/terminal/ui/ProjectTerminalDock";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = Omit<ComponentProps<typeof ProjectTerminalDock>, "dock" | "focused"> & {
  store: WorkspaceStore;
  /** A dock mid-slide stays rendered until it has closed. */
  closingShown: boolean;
};

/** Every project's terminal dock, with only the current project's shown in the dock grid area. */
export function ProjectTerminalDocks({ store, closingShown, ...dockProps }: Props) {
  const projectTerminals = useWorkspaceField(store, "projectTerminals");
  const projectCwd = useWorkspaceField(store, "projectCwd");
  const projectTerminalFocused = useWorkspaceField(store, "projectTerminalFocused");
  const familiarViewId = useWorkspaceField(store, "familiarViewId");

  return projectTerminals.map((dock) => {
    const show =
      (dock.open || closingShown) &&
      !familiarViewId &&
      sameProjectPath(dock.projectPath, projectCwd);

    return (
      <div
        key={dock.projectPath}
        className={show ? "h-full min-h-0 min-w-0 w-full overflow-hidden" : "hidden"}
        style={show ? { gridArea: "dock" } : undefined}
        aria-hidden={!show}
        data-dock-shown={show ? "" : undefined}
      >
        <ProjectTerminalDock {...dockProps} dock={dock} focused={show && projectTerminalFocused} />
      </div>
    );
  });
}
