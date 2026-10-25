import { SessionStateContext } from "@/features/sessions/model/session-state-store";
import {
  OrchestrationActions,
  OrchestrationWorkers,
} from "@/features/orchestration/ui/orchestration-actions";
import { TranscriptPoolOutlet } from "@/features/sessions/ui/TranscriptPool";
import { WorkspaceHandlersContext } from "../../handlers/workspace-handlers";
import { LocalSurfaceViews } from "../../../ui/LocalSurfaceViews";
import { InboxAskPanes } from "../app-views/InboxAskPanes";
import { WorkspaceAppViews } from "../app-views/WorkspaceAppViews";
import { FamiliarSettingsPanel } from "../familiars/FamiliarSettingsPanel";
import { WorkspaceLayout } from "../layout/WorkspaceLayout";
import { WorkspaceDialogs } from "../notices/WorkspaceDialogs";
import { WorkspaceNotices } from "../notices/WorkspaceNotices";
import { WorkspacePickerDialogs } from "../notices/WorkspacePickerDialogs";
import { InsetRightPanel } from "../workspace-chrome/InsetRightPanel";
import { WorkspaceSettings } from "../workspace-chrome/WorkspaceSettings";
import { FamiliarSessionPanes } from "../workspace-main/FamiliarSessionPanes";
import { LinkedWorkItemPanels } from "../workspace-main/LinkedWorkItemPanels";
import { ProjectTerminalDocks } from "../workspace-main/ProjectTerminalDocks";
import { WorkspaceTabPanes } from "../workspace-main/WorkspaceTabPanes";
import type { WorkspaceViewProps } from "./types";
import {
  renderFamiliarOverviewPanel,
  renderSidebar,
  renderTitleBar,
  renderUsageFooter,
  shownSessionState,
} from "./workspace-view-parts";

/** The Workspace's markup; everything it shows was computed by the Workspace this render. */
export function WorkspaceView(props: WorkspaceViewProps) {
  const { core, flows, view } = props;
  const { sessionState, workspaceStore, insetLayout, setInsetRailHost, sessions, composerFocused } = core;
  const { composerFocusToken, transcriptPool, onOpenMonoArtifact, openAppViews, automationsSurfaceOpen } = core;
  const { automationsFocusId, localSurface, recents, projectCwd, settingsHeaderHost, sessionsRef } = core;
  const { closing: rightPanelClosing, resize: rightPanelResize } = core.rightPanel;
  const { setPane: setRightPanelRef, setHost: setRightPanelHost } = core.rightPanel;
  const { handlers, navigation } = props.titleTabFlows;
  const { orchestrationWorkers, taskBoard, sessionReminders } = flows;
  const { orchestrationActions } = flows.orchestrationFlows;
  const { surfaces } = flows.surfaceFlows;
  const { automationRuns } = flows.submissionFlows;
  const { chrome, dockSlide, active, activeTab, familiarCovers, familiarViewFamiliar, familiarViewSession } = view;
  const { familiarOverview, hiddenApprovalToasts, pressureChipHost } = view;
  const { sidebarCwd, gitCwd, filesCwd, appViewScope } = view.cwds;
  const { projectHistory, sidebarHistory } = view.histories;
  const { inboxRelatedSessions, repairSessions } = view.inboxView;
  const { onLeaveLocalSurface, onOpenHomeSession, onOpenHomeAutomation, onAutomationsFocusConsumed } = view.localSurfaceActions;
  const shown = shownSessionState(props);
  const { workspaceSwitchingSessionId, familiarShownSessionActive } = shown;
  const familiarOverviewPanel = renderFamiliarOverviewPanel(props, shown);
  const workspaceTitleBar = renderTitleBar(props);
  const sessionSidebar = renderSidebar(props);
  const usageFooter = renderUsageFooter(props);
  const dockClosingShown = dockSlide.closingShown;

  return (
    <SessionStateContext.Provider value={sessionState}>
    <WorkspaceHandlersContext.Provider value={handlers}>
    <OrchestrationActions.Provider value={orchestrationActions}>
      <OrchestrationWorkers.Provider value={orchestrationWorkers}>
        <WorkspaceLayout
          store={workspaceStore}
          insetLayout={insetLayout}
              chrome={chrome}
          titleBar={workspaceTitleBar}
          sidebar={sessionSidebar}
          onInsetRailHost={setInsetRailHost}
          dockGridRef={dockSlide.gridRef}
          docks={
            <ProjectTerminalDocks
              store={workspaceStore}
              closingShown={dockClosingShown}
              onSizePaint={dockSlide.paintSize}
              onSizeCommit={dockSlide.commitSize}
            />
          }
          panes={
            <>
              <WorkspaceTabPanes
                store={workspaceStore}
                workspaceSwitchingSessionId={workspaceSwitchingSessionId}
                sessions={sessions}
                activeSessionId={active?.id}
                composerFocused={composerFocused}
                composerFocusToken={composerFocusToken}
                transcriptPool={transcriptPool}
              />
              <FamiliarSessionPanes
                store={workspaceStore}
                workspaceSwitchingSessionId={workspaceSwitchingSessionId}
                sessions={sessions}
                insetLayout={insetLayout}
                familiar={familiarViewFamiliar}
                composerFocused={composerFocused}
                composerFocusToken={composerFocusToken}
                shownSessionActive={familiarShownSessionActive}
                onOpenArtifact={onOpenMonoArtifact}
                activityTurnId={familiarOverview.activityShownTurnId}
                launchedSessions={familiarOverview.launchedSessions}
              />
            </>
          }
          linkedPanels={
            <LinkedWorkItemPanels
              store={workspaceStore}
              activeTab={activeTab}
              covered={chrome.surfaceOpen || familiarCovers}
              repairSessions={repairSessions}
            />
          }
          familiarOverview={familiarCovers ? familiarOverviewPanel : null}
          familiarSettings={<FamiliarSettingsPanel store={workspaceStore} session={familiarViewSession} />}
          appViews={
            <WorkspaceAppViews
              store={workspaceStore}
              insetLayout={insetLayout}
              openAppViews={openAppViews}
                      automationsOpen={automationsSurfaceOpen}
              besideRail={chrome.appViewBesideRail}
              compactRail={chrome.appViewCompactRail}
              gitCwd={gitCwd}
              sidebarCwd={sidebarCwd}
              scopeProject={appViewScope}
              history={projectHistory}
              sessions={sessions}
              automationsFocusId={automationsFocusId}
              inboxAsk={
                <InboxAskPanes
                  store={workspaceStore}
                  sessions={sessions}
                  composerFocused={composerFocused}
                  composerFocusToken={composerFocusToken}
                  workspaceSwitchingSessionId={workspaceSwitchingSessionId}
                />
              }
              localSurfaces={
                <LocalSurfaceViews
                  surface={localSurface}
                  besideRail={chrome.appViewBesideRail}
                  compactRail={chrome.appViewCompactRail}
                  projectPaths={recents.map((project) => project.path)}
                  projectCwd={projectCwd}
                  onClose={onLeaveLocalSurface}
                  onToggleSidebar={navigation.toggleSidebar}
                  onOpenSession={onOpenHomeSession}
                  onOpenAutomation={onOpenHomeAutomation}
                  onOpenAutomations={surfaces.openAutomations}
                  onOpenUsage={navigation.openUsage}
                  onOpenInbox={surfaces.openInbox}
                  taskBoard={taskBoard}
                />
              }
              inbox={{ sessions: inboxRelatedSessions, repairSessions }}
              automations={{
                onFocusAutomationConsumed: onAutomationsFocusConsumed,
                onLaunch: (automation, run) => automationRuns.launch(automation, run, true),
              }}
            />
          }
          settings={
            <WorkspaceSettings
              store={workspaceStore}
              cwd={sidebarCwd}
              sessions={sidebarHistory}
              liveSessions={sessions}
              headerHost={insetLayout ? settingsHeaderHost : undefined}
            />
          }
          usageFooter={usageFooter}
          rightPanel={
            <InsetRightPanel
              shown={chrome.insetRightPanelShown}
              closing={rightPanelClosing}
              resize={rightPanelResize}
              onPane={setRightPanelRef}
              onHost={setRightPanelHost}
            />
          }
          overlays={
            <>
              <WorkspacePickerDialogs store={workspaceStore} cwd={filesCwd} />
              <WorkspaceNotices
                pressure={{
                  sessions: sessionsRef,
                  onPressureChange: transcriptPool.setResourcePressure,
                  chipHost: pressureChipHost,
                  insetChip: insetLayout,
                }}
                approvalNotices={hiddenApprovalToasts}
                reminders={sessionReminders}
              />
              <WorkspaceDialogs store={workspaceStore} />
            </>
          }
        />
        <TranscriptPoolOutlet pool={transcriptPool} />
      </OrchestrationWorkers.Provider>
    </OrchestrationActions.Provider>
    </WorkspaceHandlersContext.Provider>
    </SessionStateContext.Provider>
  );
}
