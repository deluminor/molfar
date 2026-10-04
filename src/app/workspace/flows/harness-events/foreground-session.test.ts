import { describe, expect, it } from "vitest";
import { newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { type ForegroundView, isForegroundSession } from "./foreground-session";

function view(overrides: Partial<ForegroundView> = {}): ForegroundView {
  return {
    hidden: false,
    workspaceVisible: true,
    activeTab: newTab("shown"),
    ...overrides,
  };
}

function tabWithAgentFile(sessionId: string): WorkspaceTab {
  return {
    ...newTab("other"),
    editorPanes: [
      {
        id: "pane",
        activeFileId: "file",
        files: [
          {
            id: "file",
            path: "agent",
            cwd: "/repo",
            agent: { sessionId, leadId: "lead", harness: "claude" },
          },
        ],
      },
    ],
  };
}

describe("isForegroundSession", () => {
  it("is true for a session in the active tab's layout", () => {
    expect(isForegroundSession("shown", view())).toBe(true);
    expect(isForegroundSession("elsewhere", view())).toBe(false);
  });

  it("is false while the window is hidden, even for the Inbox session", () => {
    expect(
      isForegroundSession(
        "shown",
        view({ hidden: true, inboxSessionId: "shown" }),
      ),
    ).toBe(false);
  });

  it("is false when a surface covers the workspace", () => {
    expect(
      isForegroundSession("shown", view({ workspaceVisible: false })),
    ).toBe(false);
  });

  it("is true for the session the Inbox shows, over any surface", () => {
    expect(
      isForegroundSession(
        "inbox",
        view({ workspaceVisible: false, inboxSessionId: "inbox" }),
      ),
    ).toBe(true);
  });

  it("is true for an agent session open as the active file of an editor pane", () => {
    expect(
      isForegroundSession(
        "agent",
        view({ activeTab: tabWithAgentFile("agent") }),
      ),
    ).toBe(true);
  });
});
