import type { ComponentProps } from "react";
import type { Session } from "@/domain/session/session";
import { findProjectTerminal } from "@/features/projects/model/project-terminal";
import { isLocalProject } from "@/features/projects/model/recents";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { UsageFooter } from "../../../shell/UsageFooter";
import { useWorkspaceHandlers } from "../../handlers/workspace-handlers";
import { useWorkspaceField } from "../../hooks/use-workspace-field";
import type { WorkspaceStore } from "../../store/types";
import { useFooterUsage } from "./use-footer-usage";
import { useRunningTerminals } from "./use-running-terminals";

type Props = Pick<ComponentProps<typeof UsageFooter>, "pressureSlot" | "inset"> & {
  store: WorkspaceStore;
  /** The session whose plan usage shows. */
  source: Session | undefined;
  activeTab: WorkspaceTab | undefined;
};

/** The usage footer, with the current project's terminals; a Familiar in full view has none of its own. */
export function WorkspaceUsageFooter({
  store,
  source,
  activeTab,
  ...footerProps
}: Props) {
  const { providerAccounts, surfaces, terminals } = useWorkspaceHandlers();
  const projectCwd = useWorkspaceField(store, "projectCwd");
  const projectTerminals = useWorkspaceField(store, "projectTerminals");
  const familiarViewId = useWorkspaceField(store, "familiarViewId");
  const usage = useFooterUsage(source);
  const running = useRunningTerminals(store, activeTab);
  const dock = findProjectTerminal(projectTerminals, projectCwd);
  const terminalsShown = !familiarViewId;
  const localTerminals = terminalsShown && isLocalProject(projectCwd);

  return (
    <UsageFooter
      {...footerProps}
      onSelectAccount={providerAccounts.select}
      onManageAccounts={surfaces.manageProviderAccounts}
      onToggleTerminal={terminals.toggleRunning}
      providers={usage.providers}
      session={usage.session}
      project={source?.cwd ?? projectCwd}
      terminals={terminalsShown ? running.terminals : undefined}
      terminalOpen={terminalsShown && running.open}
      onNewTerminal={localTerminals ? terminals.openNew : undefined}
      onToggleProjectTerminal={localTerminals ? terminals.toggleDock : undefined}
      projectTerminalActive={terminalsShown && !!dock && dock.pane.files.length > 0}
      projectTerminalOpen={terminalsShown && !!dock?.open}
    />
  );
}
