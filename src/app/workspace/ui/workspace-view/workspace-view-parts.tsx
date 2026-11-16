import type { ReactNode } from "react";
import { pickTextHarness } from "@/integrations/harness";
import { FamiliarOverviewPanel } from "../familiars/FamiliarOverviewPanel";
import { WorkspaceUsageFooter } from "../workspace-chrome/WorkspaceUsageFooter";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceTitleBar } from "../WorkspaceTitleBar";
import type { WorkspaceViewProps } from "./types";

export type ShownSessionState = ReturnType<typeof shownSessionState>;

export function shownSessionState({ core, view }: WorkspaceViewProps) {
  const { sessions, shownFamiliarSessionId, familiarShownSessionFocused } = core;
  const workspaceSwitchingSessionId = view.workspaceNavigation.pending ? view.active?.id : undefined;
  const familiarShownSessionPane = shownFamiliarSessionId
    ? sessions.find((session) => session.id === shownFamiliarSessionId)
    : undefined;
  const familiarShownSessionActive =
    !!familiarShownSessionPane && familiarShownSessionFocused;

  return { workspaceSwitchingSessionId, familiarShownSessionPane, familiarShownSessionActive };
}

export function renderFamiliarOverviewPanel({ core, view }: WorkspaceViewProps, shown: ShownSessionState): ReactNode {
  const { workspaceStore, sessions, history, composerFocused, composerFocusToken } = core;
  const { familiarViewFamiliar, familiarViewSession, familiarOverview } = view;
  const { familiarShownSessionPane, familiarShownSessionActive, workspaceSwitchingSessionId } = shown;

  return familiarViewFamiliar && familiarViewSession ? (
      <FamiliarOverviewPanel
        store={workspaceStore}
        familiar={familiarViewFamiliar}
        session={familiarViewSession}
        overview={familiarOverview}
        sessions={sessions}
        history={history}
        shownSession={{
          session: familiarShownSessionPane,
          active: familiarShownSessionActive,
          composerFocused,
          composerFocusToken,
          workspaceSwitchingSessionId,
        }}
      />
    ) : null;
}

export function renderTitleBar({ core, view }: WorkspaceViewProps): ReactNode {
  const { workspaceStore, insetLayout, activeAppView, setSettingsHeaderHost } = core;
  const { open: rightPanelOpen, toggle: onToggleRightPanel } = core.rightPanel;
  const { titleTabs, familiarViewSession, chrome } = view;
  const { sidebarCwd, gitCwd } = view.cwds;

  return (
    <WorkspaceTitleBar
      store={workspaceStore}
      tabs={titleTabs}
      inset={insetLayout}
      cwd={sidebarCwd}
      gitCwd={gitCwd}
      familiarSession={familiarViewSession}
      activeAppView={activeAppView}
      compactRail={chrome.compactTitleNavigation}
      showRightPanelToggle={chrome.showRightPanelToggle}
      rightPanelOpen={rightPanelOpen}
      onToggleRightPanel={onToggleRightPanel}
      onSettingsHeaderHost={setSettingsHeaderHost}
    />
  );
}

export function renderSidebar({ core, flows, view }: WorkspaceViewProps): ReactNode {
  const { workspaceStore, automationsViewOpen, sessions, tabWorkspace, insetLayout, localSurface, railSurfaces } = core;
  const { automationsSurfaceOpen } = core;
  const { host: rightPanelHost, open: rightPanelOpen, tab: rightPanelTab, closing: rightPanelClosing } = core.rightPanel;
  const { show: showRightPanel } = core.rightPanel;
  const { activeTab, active, workspaceNavigation, familiarReplyCounts, busySessionIds, activeSessionId, liveAgents } = view;
  const { chrome, unseenFinishedIds } = view;
  const { sidebarCwd, gitCwd } = view.cwds;
  const { sidebarTab, setSidebarTab } = view.sidebar;
  const { sidebarHistory } = view.histories;
  const { unseen: inboxUnseen, linkedSessionUpdateIds } = view.inboxActivity;
  const { onOpenKnowledge, localSurfaceRailActions, onOpenLocalSurface } = view.localSurfaceActions;
  const { sessionReminders, railBadges } = flows;

  return (
    <WorkspaceSidebar
      store={workspaceStore}
      automationsViewOpen={automationsViewOpen}
      cwd={sidebarCwd}
      gitCwd={gitCwd}
      liveSessions={sessions}
      activeTab={activeTab}
      activeSession={active}
      tabWorkspace={tabWorkspace}
      workspaceSwitch={workspaceNavigation}
      unseenFamiliarReplies={familiarReplyCounts}
      tab={sidebarTab}
      onTabChange={setSidebarTab}
      rightPanel={{
        host: rightPanelHost,
        open: rightPanelOpen || rightPanelClosing,
        tab: rightPanelTab,
        onTabChange: showRightPanel,
      }}
      sessions={sidebarHistory}
      busySessionIds={busySessionIds}
      activeSessionId={activeSessionId}
      reminders={sessionReminders.reminders}
      onSetReminders={sessionReminders.schedule}
      onCancelReminders={sessionReminders.cancel}
      textHarness={pickTextHarness(active?.harness)}
      liveAgents={liveAgents}
      onOpenKnowledge={railSurfaces.knowledge ? onOpenKnowledge : undefined}
      knowledgeActive={localSurface === "knowledge"}
      automationsActive={automationsSurfaceOpen}
      railExtraActions={localSurfaceRailActions}
      localSurfaces={{
        active: localSurface,
        visible: railSurfaces,
        onOpen: onOpenLocalSurface,
        badges: railBadges,
      }}
      titleBarAbove={chrome.sidebarTitleBarAbove}
      inset={insetLayout}
      unseenFinishedIds={unseenFinishedIds}
      inboxUnseen={inboxUnseen}
      linkedSessionUpdateIds={linkedSessionUpdateIds}
    />
  );
}

export function renderUsageFooter({ core, view }: WorkspaceViewProps): ReactNode {
  const { workspaceStore, insetLayout } = core;
  const { chrome, setPressureChipHost, usageSource, activeTab } = view;

  return chrome.usageFooterShown ? (
    <WorkspaceUsageFooter
      store={workspaceStore}
      pressureSlot={setPressureChipHost}
      source={usageSource}
      activeTab={activeTab}
      inset={insetLayout}
    />
  ) : null;
}
