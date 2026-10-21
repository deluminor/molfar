import type { ComponentProps } from "react";
import { findProjectTerminal } from "@/features/projects/model/project-terminal";
import { isLocalProject } from "@/features/projects/model/recents";
import { UsageFooter } from "../../../shell/UsageFooter";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";

type Props = Pick<
  ComponentProps<typeof UsageFooter>,
  | "pressureSlot"
  | "providers"
  | "session"
  | "project"
  | "onSelectAccount"
  | "onManageAccounts"
  | "terminals"
  | "terminalOpen"
  | "onToggleTerminal"
  | "onNewTerminal"
  | "onToggleProjectTerminal"
  | "inset"
> & { store: WorkspaceStore };

/** The usage footer, with the current project's terminals; a Familiar in full view has none of its own. */
export function WorkspaceUsageFooter({
  store,
  project,
  terminals,
  terminalOpen,
  onNewTerminal,
  onToggleProjectTerminal,
  ...footerProps
}: Props) {
  const projectCwd = useWorkspaceField(store, "projectCwd");
  const projectTerminals = useWorkspaceField(store, "projectTerminals");
  const familiarViewId = useWorkspaceField(store, "familiarViewId");
  const dock = findProjectTerminal(projectTerminals, projectCwd);
  const terminalsShown = !familiarViewId;
  const localTerminals = terminalsShown && isLocalProject(projectCwd);

  return (
    <UsageFooter
      {...footerProps}
      project={project ?? projectCwd}
      terminals={terminalsShown ? terminals : undefined}
      terminalOpen={terminalsShown && terminalOpen}
      onNewTerminal={localTerminals ? onNewTerminal : undefined}
      onToggleProjectTerminal={localTerminals ? onToggleProjectTerminal : undefined}
      projectTerminalActive={terminalsShown && !!dock && dock.pane.files.length > 0}
      projectTerminalOpen={terminalsShown && !!dock?.open}
    />
  );
}
