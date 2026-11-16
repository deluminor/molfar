import type { Session } from "@/domain/session/session";
import type { useProjectBranches } from "@/features/source-control/hooks/use-project-branches";
import type { WorkspaceCwds } from "../../../model/workspace-cwds";
import type { FamiliarView } from "../../flows/familiars/familiar-view";
import type { WorkspaceCore } from "../core/use-workspace-core";
import type { createHarnessTurnFlows } from "../flows/use-harness-turn-flows";
import type { createInboxFlows } from "../flows/use-inbox-flows";
import type { useSidebarTab } from "../sidebar/use-sidebar-tab";
import type { WorkspaceFlows } from "../workspace-flows/use-workspace-flows";

/** What the Workspace's title tabs, sidebar views, commands and chrome read this render. */
export type WorkspaceViewFlowsInput = {
  core: WorkspaceCore;
  flows: WorkspaceFlows;
  inbox: ReturnType<typeof createInboxFlows>;
  turnActions: ReturnType<typeof createHarnessTurnFlows>["turnActions"];
  familiarView: FamiliarView;
  sidebar: ReturnType<typeof useSidebarTab>;
  cwds: WorkspaceCwds;
  promptableSessions: Session[];
  projectBranches: ReturnType<typeof useProjectBranches>;
  unseenFinishedIds: Set<string>;
  familiarViewSession: Session | undefined;
  familiarCovers: boolean;
};
