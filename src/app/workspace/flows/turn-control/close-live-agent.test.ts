import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { newTab, splitPane, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { type CloseLiveAgentDeps, closeLiveAgent } from "./close-live-agent";

const dialog = vi.hoisted(() => ({ ok: true, asked: 0 }));

vi.mock("@/shared/lib/app-dialog", () => ({
  confirmApp: async () => {
    dialog.asked += 1;
    return dialog.ok;
  },
}));

function setup(sessions: Partial<Session>[], tabs: WorkspaceTab[]) {
  const open = sessions.map((patch) => ({ ...testSession("claude", "/work/demo"), ...patch }));
  let current = tabs;
  const deps = {
    sessions: () => open,
    tabs: () => current,
    dismiss: vi.fn(),
    stop: vi.fn(),
    closeTab: vi.fn(),
    persist: vi.fn(),
    updateTabs: vi.fn((update: (prev: WorkspaceTab[]) => WorkspaceTab[]) => {
      current = update(current);
    }),
  } satisfies CloseLiveAgentDeps;
  return { deps, tabs: () => current };
}

const split = (): WorkspaceTab => ({
  ...newTab("a"),
  id: "t",
  layout: splitPane({ type: "leaf", id: "a" }, "a", "right", "b"),
});

describe("closeLiveAgent", () => {
  beforeEach(() => {
    dialog.ok = true;
    dialog.asked = 0;
  });

  it("closes the tab of an idle session without asking", async () => {
    const tab = { ...newTab("a"), id: "t" };
    const { deps } = setup([{ id: "a" }], [tab]);

    await closeLiveAgent(deps, "a");

    expect(dialog.asked).toBe(0);
    expect(deps.dismiss).toHaveBeenCalledWith("a");
    expect(deps.stop).not.toHaveBeenCalled();
    expect(deps.closeTab).toHaveBeenCalledWith("t");
  });

  it("keeps a running session when the user declines", async () => {
    const { deps } = setup([{ id: "a", busy: true }], [{ ...newTab("a"), id: "t" }]);
    dialog.ok = false;

    await closeLiveAgent(deps, "a");

    expect(dialog.asked).toBe(1);
    expect(deps.dismiss).not.toHaveBeenCalled();
    expect(deps.closeTab).not.toHaveBeenCalled();
  });

  it("stops a running session, then closes only its pane of a split tab", async () => {
    const { deps, tabs } = setup([{ id: "a", busy: true }, { id: "b" }], [split()]);

    await closeLiveAgent(deps, "a");

    expect(deps.stop).toHaveBeenCalledWith("a");
    expect(deps.closeTab).not.toHaveBeenCalled();
    expect(deps.persist).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    expect(tabs()[0].focusedId).toBe("b");
  });
});
