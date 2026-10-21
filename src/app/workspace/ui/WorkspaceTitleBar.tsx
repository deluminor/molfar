import type { ComponentProps } from "react";
import type { Session } from "@/domain/session/session";
import {
  type Familiar,
  familiarLook,
  familiarState,
} from "@/features/familiars/model/familiar";
import { isLocalProject, looksLikeProject } from "@/features/projects/model/recents";
import { useProjectDiffStats } from "@/features/source-control/hooks/use-project-diff-stats";
import { type AppView, appViewTabId } from "@/features/workspace/model/app-view-tabs";
import { TitleBar } from "../../shell/TitleBar";
import { useWorkspaceActions } from "../hooks/use-workspace-actions";
import { useWorkspaceField } from "../hooks/use-workspace-field";
import type { WorkspaceStore } from "../store/types";

type TitleBarProps = ComponentProps<typeof TitleBar>;

type Props = Pick<
  TitleBarProps,
  | "tabs"
  | "cwd"
  | "rightPanelOpen"
  | "onGoBack"
  | "onGoForward"
  | "onToggleSidebar"
  | "onToggleSessionSidebar"
  | "onSelect"
  | "onNewTerminal"
  | "onOpenSettings"
  | "onOpenInbox"
  | "onOpenNotes"
  | "onClose"
  | "onCloseMany"
  | "onCloseAll"
  | "onArchiveTab"
  | "onDeleteTab"
  | "onReorder"
  | "onPlaceOnPane"
  | "onPinFile"
  | "onSelectProject"
> & {
  store: WorkspaceStore;
  inset: boolean;
  gitCwd: string;
  familiar: Familiar | undefined;
  familiarSession: Session | undefined;
  familiarTabId: string | undefined;
  overviewShown: boolean;
  activeAppView: AppView | undefined;
  compactRail: boolean;
  showRightPanelToggle: boolean;
  onToggleRightPanel: () => void;
  onSettingsHeaderHost: (host: HTMLDivElement | null) => void;
  onNew: () => void;
  onCloseFamiliarView: () => void;
};

const NO_TITLE_TABS: TitleBarProps["tabs"] = [];

/** The workspace's title bar: its tabs, toggles and the Familiar in view. */
export function WorkspaceTitleBar({
  store,
  tabs,
  inset,
  cwd,
  gitCwd,
  familiar,
  familiarSession,
  familiarTabId,
  overviewShown,
  activeAppView,
  compactRail,
  showRightPanelToggle,
  onToggleRightPanel,
  onSettingsHeaderHost,
  onNew,
  onCloseFamiliarView,
  ...passThrough
}: Props) {
  const settingsOpen = useWorkspaceField(store, "settingsOpen");
  const familiarViewId = useWorkspaceField(store, "familiarViewId");
  const familiarOverviewOpen = useWorkspaceField(store, "familiarOverviewOpen");
  const projectRailOpen = useWorkspaceField(store, "projectRailOpen");
  const sessionSidebarOpen = useWorkspaceField(store, "sessionSidebarOpen");
  const activeTabId = useWorkspaceField(store, "activeTabId");
  const tabVisitNav = useWorkspaceField(store, "tabVisitNav");
  const recents = useWorkspaceField(store, "recents");
  const { setFamiliarOverviewOpen, setFamiliarSettingsFor } = useWorkspaceActions(store);
  const covers = !!familiarViewId;
  // The same shared stats the sidebar's Changes tab reads, so the toggle
  // that opens it can carry its dot.
  const rightPanelChanges = useProjectDiffStats(
    gitCwd || cwd,
    showRightPanelToggle && isLocalProject(cwd),
  );

  // A new session takes over from a Familiar in view.
  const onNewFromTitleBar = () => {
    if (store.getState().familiarViewId) onCloseFamiliarView();
    onNew();
  };

  const onToggleFamiliarOverview = () => setFamiliarOverviewOpen((open) => !open);
  const onOpenFamiliarSettings = familiar ? () => setFamiliarSettingsFor(familiar.id) : undefined;

  let activeId = activeTabId;
  if (familiarSession) activeId = inset ? (familiarTabId ?? "") : "";
  else if (inset && activeAppView) activeId = appViewTabId(activeAppView);

  return (
    <TitleBar
      {...passThrough}
      // A Familiar in full view stands apart from the project's tabs, except
      // in the inset layout, where it is one of them.
      tabs={covers && !inset ? NO_TITLE_TABS : tabs}
      content={
        inset && settingsOpen ? (
          <div
            ref={onSettingsHeaderHost}
            data-settings-title
            className="flex h-full min-w-0 flex-1"
          />
        ) : undefined
      }
      familiar={
        covers && familiar && familiarSession
          ? { look: familiarLook(familiar), state: familiarState(familiarSession) }
          : undefined
      }
      // The inset layout keeps these in the Familiar's pane, under its tab.
      onToggleFamiliarOverview={covers && !inset ? onToggleFamiliarOverview : undefined}
      familiarOverviewOpen={familiarOverviewOpen}
      onOpenFamiliarSettings={covers && !inset ? onOpenFamiliarSettings : undefined}
      hideWindowControls={covers && familiarOverviewOpen && overviewShown}
      activeId={activeId}
      cwd={cwd}
      projectRailOpen={projectRailOpen}
      sessionSidebarOpen={sessionSidebarOpen}
      compactRail={!inset && compactRail}
      inset={inset}
      onToggleRightPanel={showRightPanelToggle ? onToggleRightPanel : undefined}
      rightPanelDot={(rightPanelChanges?.files ?? 0) > 0}
      rightPanelUnavailable={!!activeAppView}
      canGoBack={covers || tabVisitNav.canBack}
      canGoForward={tabVisitNav.canForward}
      onNewSession={
        inset && !settingsOpen && looksLikeProject(cwd) ? onNewFromTitleBar : undefined
      }
      recents={recents}
    />
  );
}
