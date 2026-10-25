import { describe, expect, it } from "vitest";
import { type WorkspaceChromeInput, workspaceChrome } from "./workspace-chrome";

const base: WorkspaceChromeInput = {
  isMac: true,
  insetLayout: false,
  searchViewOpen: false,
  settingsOpen: false,
  inboxViewOpen: false,
  notesViewOpen: false,
  automationsViewOpen: false,
  compactProjectRail: false,
  projectRailOpen: true,
  familiarCovers: false,
  rightPanelOpen: false,
  rightPanelClosing: false,
  activeAppView: undefined,
  sidebarCwd: "/work/app",
};

const chrome = (patch: Partial<WorkspaceChromeInput> = {}) => workspaceChrome({ ...base, ...patch });

describe("workspaceChrome", () => {
  it("keeps the classic title bar in the body beside an open rail", () => {
    expect(chrome()).toMatchObject({
      surfaceOpen: false,
      titleBarSpansWindow: false,
      titleBarInBody: true,
      sidebarTitleBarAbove: false,
      appViewBesideRail: true,
      appViewCompactRail: false,
      usageFooterShown: true,
    });
  });

  it("lifts the title bar across the window beside a collapsed compact rail on macOS", () => {
    const compact = { compactProjectRail: true, projectRailOpen: false };

    expect(chrome(compact)).toMatchObject({
      compactTitleNavigation: true,
      titleBarSpansWindow: true,
      titleBarInBody: false,
      appViewCompactRail: true,
    });
    expect(chrome({ ...compact, isMac: false }).titleBarSpansWindow).toBe(false);
    expect(chrome({ ...compact, searchViewOpen: true }).compactTitleNavigation).toBe(false);
    expect(chrome({ ...compact, familiarCovers: true })).toMatchObject({
      compactTitleNavigation: true,
      titleBarSpansWindow: false,
    });
  });

  it("treats any open view as a surface over the workspace and drops the footer", () => {
    for (const view of ["searchViewOpen", "settingsOpen", "inboxViewOpen", "notesViewOpen", "automationsViewOpen"]) {
      expect(chrome({ [view]: true })).toMatchObject({ surfaceOpen: true, usageFooterShown: false });
    }
  });

  it("keeps the inset footer under a tabbed app view and a Familiar", () => {
    expect(chrome({ insetLayout: true, searchViewOpen: true, activeAppView: "search" }).usageFooterShown).toBe(true);
    expect(chrome({ insetLayout: true, familiarCovers: true }).usageFooterShown).toBe(true);
    expect(chrome({ familiarCovers: true }).usageFooterShown).toBe(false);
  });

  it("shows the inset right panel only beside a project's workspace", () => {
    const inset = { insetLayout: true, rightPanelOpen: true };

    expect(chrome(inset)).toMatchObject({ insetRightPanelShown: true, showRightPanelToggle: true });
    expect(chrome({ ...inset, rightPanelOpen: false, rightPanelClosing: true }).insetRightPanelShown).toBe(true);
    expect(chrome({ ...inset, settingsOpen: true })).toMatchObject({
      insetRightPanelShown: false,
      showRightPanelToggle: false,
    });
    expect(chrome({ ...inset, familiarCovers: true }).insetRightPanelShown).toBe(false);
    expect(chrome({ ...inset, activeAppView: "inbox" }).insetRightPanelShown).toBe(false);
    expect(chrome({ ...inset, sidebarCwd: "" })).toMatchObject({
      insetRightPanelShown: false,
      showRightPanelToggle: false,
    });
    expect(chrome({ rightPanelOpen: true }).insetRightPanelShown).toBe(false);
  });
});
