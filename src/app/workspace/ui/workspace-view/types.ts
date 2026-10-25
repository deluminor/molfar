import type { Dispatch, SetStateAction } from "react";
import type { Session } from "@/domain/session/session";
import type { Familiar } from "@/features/familiars/model/familiar";
import type { useInboxActivity } from "@/features/inbox/hooks/use-inbox-unseen";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { useWorkspaceNavigation } from "../../../hooks/use-workspace-navigation";
import type { useLocalSurfaceActions } from "../../../model/local-surfaces/use-local-surface-actions";
import type { WorkspaceCwds } from "../../../model/workspace-cwds";
import type { WorkspaceCore } from "../../hooks/core/use-workspace-core";
import type { FamiliarOverviewData } from "../../hooks/familiars/use-familiar-overview-data";
import type { TitleTabFlows } from "../../hooks/flows/use-title-tab-flows";
import type { useInboxView } from "../../hooks/inbox/use-inbox-view";
import type { useApprovalToastsView } from "../../hooks/notifications/use-approval-toasts-view";
import type { useLiveAgentsView } from "../../hooks/sidebar/use-live-agents-view";
import type { useSidebarHistoryView } from "../../hooks/sidebar/use-sidebar-history-view";
import type { useSidebarTab } from "../../hooks/sidebar/use-sidebar-tab";
import type { useDockSlide } from "../../hooks/use-dock-slide";
import type { WorkspaceFlows } from "../../hooks/workspace-flows/use-workspace-flows";
import type { Tab as TitleTab } from "@/features/workspace/model/title-tab";
import type { WorkspaceChrome } from "../layout/workspace-chrome";

/** What the Workspace computed this render for its view; the view itself runs no hooks. */
export type WorkspaceViewState = {
  active: Session | undefined;
  activeTab: WorkspaceTab | undefined;
  activeSessionId: string | undefined;
  usageSource: Session | undefined;
  familiarViewSession: Session | undefined;
  familiarViewFamiliar: Familiar | undefined;
  familiarCovers: boolean;
  familiarOverview: FamiliarOverviewData;
  workspaceNavigation: ReturnType<typeof useWorkspaceNavigation>;
  cwds: WorkspaceCwds;
  sidebar: ReturnType<typeof useSidebarTab>;
  familiarReplyCounts: ReadonlyMap<string, number>;
  busySessionIds: Set<string>;
  unseenFinishedIds: Set<string>;
  liveAgents: ReturnType<typeof useLiveAgentsView>;
  hiddenApprovalToasts: ReturnType<typeof useApprovalToastsView>;
  pressureChipHost: HTMLSpanElement | null;
  setPressureChipHost: Dispatch<SetStateAction<HTMLSpanElement | null>>;
  histories: ReturnType<typeof useSidebarHistoryView>;
  inboxActivity: ReturnType<typeof useInboxActivity>;
  inboxView: ReturnType<typeof useInboxView>;
  localSurfaceActions: ReturnType<typeof useLocalSurfaceActions>;
  titleTabs: TitleTab[];
  chrome: WorkspaceChrome;
  dockSlide: ReturnType<typeof useDockSlide>;
};

export type WorkspaceViewProps = {
  core: WorkspaceCore;
  flows: WorkspaceFlows;
  titleTabFlows: Pick<TitleTabFlows, "navigation" | "handlers">;
  view: WorkspaceViewState;
};
