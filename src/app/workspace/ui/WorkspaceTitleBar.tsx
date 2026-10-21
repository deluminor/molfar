import { type ComponentProps, useSyncExternalStore } from "react";
import type { Session } from "@/domain/session/session";
import {
  familiarForSession,
  familiarLook,
  familiarState,
  familiarsSnapshot,
  subscribeFamiliars,
} from "@/features/familiars/model/familiar";
import { isLocalProject, looksLikeProject } from "@/features/projects/model/recents";
import { loadNotesEnabled, subscribeNotesEnabled } from "@/features/settings/model/settings";
import { useProjectDiffStats } from "@/features/source-control/hooks/use-project-diff-stats";
import {
  type AppView,
  appViewTabId,
  familiarTabId,
} from "@/features/workspace/model/app-view-tabs";
import { TitleBar } from "../../shell/TitleBar";
import { useWorkspaceHandlers } from "../handlers/workspace-handlers";
import { useWorkspaceActions } from "../hooks/use-workspace-actions";
import { useWorkspaceField } from "../hooks/use-workspace-field";
import type { WorkspaceStore } from "../store/types";
import { titleBarHandlerProps } from "./title-bar-handler-props";

type TitleBarProps = ComponentProps<typeof TitleBar>;

type Props = Pick<TitleBarProps, "tabs" | "cwd" | "rightPanelOpen"> & {
  store: WorkspaceStore;
  inset: boolean;
  gitCwd: string;
  familiarSession: Session | undefined;
  activeAppView: AppView | undefined;
  compactRail: boolean;
  showRightPanelToggle: boolean;
  onToggleRightPanel: () => void;
  onSettingsHeaderHost: (host: HTMLDivElement | null) => void;
};

const NO_TITLE_TABS: TitleBarProps["tabs"] = [];

/** The workspace's title bar: its tabs, toggles and the Familiar in view. */
export function WorkspaceTitleBar({
  store,
  tabs,
  inset,
  cwd,
  gitCwd,
  familiarSession,
  activeAppView,
  compactRail,
  showRightPanelToggle,
  onToggleRightPanel,
  onSettingsHeaderHost,
  ...passThrough
}: Props) {
  const handlers = useWorkspaceHandlers();
  const settingsOpen = useWorkspaceField(store, "settingsOpen");
  const familiarViewId = useWorkspaceField(store, "familiarViewId");
  const familiarOverviewOpen = useWorkspaceField(store, "familiarOverviewOpen");
  const projectRailOpen = useWorkspaceField(store, "projectRailOpen");
  const sessionSidebarOpen = useWorkspaceField(store, "sessionSidebarOpen");
  const activeTabId = useWorkspaceField(store, "activeTabId");
  const tabVisitNav = useWorkspaceField(store, "tabVisitNav");
  const recents = useWorkspaceField(store, "recents");
  const { setFamiliarOverviewOpen, setFamiliarSettingsFor } = useWorkspaceActions(store);
  const notesEnabled = useSyncExternalStore(subscribeNotesEnabled, loadNotesEnabled, () => true);
  // Renames and mascot picks re-render the Familiar's title.
  useSyncExternalStore(subscribeFamiliars, familiarsSnapshot);
  const familiar = familiarViewId ? familiarForSession(familiarViewId) : undefined;
  const covers = !!familiarViewId;
  const overviewShown = !!familiar && !!familiarSession;
  // The same shared stats the sidebar's Changes tab reads, so the toggle
  // that opens it can carry its dot.
  const rightPanelChanges = useProjectDiffStats(
    gitCwd || cwd,
    showRightPanelToggle && isLocalProject(cwd),
  );

  // A new session takes over from a Familiar in view.
  const onNewFromTitleBar = () => {
    if (store.getState().familiarViewId) handlers.familiarView.close();
    handlers.newSessions.newSession();
  };

  const onToggleFamiliarOverview = () => setFamiliarOverviewOpen((open) => !open);
  const onOpenFamiliarSettings = familiar ? () => setFamiliarSettingsFor(familiar.id) : undefined;

  let activeId = activeTabId;
  if (familiarSession) activeId = inset && familiar ? familiarTabId(familiar.id) : "";
  else if (inset && activeAppView) activeId = appViewTabId(activeAppView);

  return (
    <TitleBar
      {...passThrough}
      {...titleBarHandlerProps(handlers, notesEnabled)}
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
