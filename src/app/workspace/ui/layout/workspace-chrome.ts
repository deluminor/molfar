import { looksLikeProject } from "@/features/projects/model/recents";
import type { AppView } from "@/features/workspace/model/app-view-tabs";

export type WorkspaceChromeInput = {
  isMac: boolean;
  insetLayout: boolean;
  searchViewOpen: boolean;
  settingsOpen: boolean;
  inboxViewOpen: boolean;
  notesViewOpen: boolean;
  automationsViewOpen: boolean;
  compactProjectRail: boolean;
  projectRailOpen: boolean;
  familiarCovers: boolean;
  rightPanelOpen: boolean;
  rightPanelClosing: boolean;
  activeAppView: AppView | undefined;
  sidebarCwd: string;
};

export type WorkspaceChrome = {
  /** A view (search, settings, inbox, notes, automations) hides the workspace body. */
  surfaceOpen: boolean;
  appViewBesideRail: boolean;
  appViewCompactRail: boolean;
  compactTitleNavigation: boolean;
  titleBarSpansWindow: boolean;
  titleBarInBody: boolean;
  sidebarTitleBarAbove: boolean;
  insetRightPanelShown: boolean;
  showRightPanelToggle: boolean;
  usageFooterShown: boolean;
};

export function workspaceChrome(input: WorkspaceChromeInput): WorkspaceChrome {
  const { insetLayout, settingsOpen, familiarCovers, activeAppView } = input;
  const surfaceOpen =
    input.searchViewOpen ||
    settingsOpen ||
    input.inboxViewOpen ||
    input.notesViewOpen ||
    input.automationsViewOpen;
  const compactRailActive = input.compactProjectRail && !input.projectRailOpen;
  const compactTitleNavigation = input.isMac && compactRailActive && !surfaceOpen;
  const compactTitleBar = compactTitleNavigation && !familiarCovers;
  const project = looksLikeProject(input.sidebarCwd);

  return {
    surfaceOpen,
    appViewBesideRail: insetLayout || input.projectRailOpen || input.compactProjectRail,
    appViewCompactRail: !insetLayout && compactRailActive,
    compactTitleNavigation,
    // The inset layout keeps its tabs across the top of the window at all
    // times, with the rail and the card below them.
    titleBarSpansWindow: insetLayout || compactTitleBar,
    titleBarInBody: !insetLayout && !compactTitleBar,
    sidebarTitleBarAbove: insetLayout || compactTitleBar,
    // Matches when the sidebar portals Explorer or Changes into the panel.
    insetRightPanelShown:
      insetLayout &&
      (input.rightPanelOpen || input.rightPanelClosing) &&
      !settingsOpen &&
      !familiarCovers &&
      !activeAppView &&
      project,
    showRightPanelToggle: insetLayout && !settingsOpen && project,
    usageFooterShown: !(
      (surfaceOpen && !(insetLayout && activeAppView)) ||
      (familiarCovers && !insetLayout)
    ),
  };
}
