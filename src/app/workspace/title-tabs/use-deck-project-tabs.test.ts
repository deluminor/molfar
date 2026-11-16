// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { useDeckProjectTabs } from "./use-deck-project-tabs";

vi.mock("@/features/workspace/model/workspace-tab-groups", () => ({
  workspaceTabCwd: (tab: { cwd?: string }) => tab.cwd,
  filterTabsForProject: (tabs: Array<{ cwd?: string }>, _sessions: unknown, project: string) =>
    tabs.filter((tab) => tab.cwd === project),
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const tab = (id: string, cwd?: string, workspace?: string) =>
  ({ id, cwd, workspace }) as unknown as WorkspaceTab;
const tabWorkspace = (entry: WorkspaceTab) => (entry as unknown as { workspace?: string }).workspace;

function deck(tabs: WorkspaceTab[], activeTabId: string, worktreePath?: string): string[] {
  let result: WorkspaceTab[] = [];
  function Probe() {
    result = useDeckProjectTabs({
      tabs,
      activeTabId,
      sessions: [] as Session[],
      projectCwd: "/repo",
      worktreePath,
      tabWorkspace,
      navigationRevision: 0,
    });
    return null;
  }
  act(() => createRoot(document.createElement("div")).render(createElement(Probe)));
  return result.map((entry) => entry.id);
}

describe("useDeckProjectTabs", () => {
  const tabs = [tab("main", "/repo", "/repo"), tab("wt", "/repo", "/repo-wt"), tab("other", "/other")];

  it("lists the project's tabs of the focused worktree plus the active one", () => {
    expect(deck(tabs, "main")).toEqual(["main"]);
    expect(deck(tabs, "main", "/repo-wt")).toEqual(["main", "wt"]);
  });

  it("shows a projectless active tab on its own", () => {
    expect(deck([...tabs, tab("loose")], "loose")).toEqual(["loose"]);
  });
});
