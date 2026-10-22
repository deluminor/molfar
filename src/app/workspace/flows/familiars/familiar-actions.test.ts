import { describe, expect, it, vi } from "vitest";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { createFamiliarActions } from "./familiar-actions";
import type { FamiliarView } from "./familiar-view";

vi.mock("@/features/familiars/model/familiar", () => ({ createFamiliar: () => ({ id: "fam" }) }));

function setup(open = true, enabled = true) {
  const store = createWorkspaceStore(testWorkspaceState());
  const view = {
    toggle: vi.fn(),
    open: vi.fn(async () => undefined),
    close: vi.fn(),
    showLaunchedSession: vi.fn(async () => undefined),
  } as unknown as FamiliarView;
  const deps = {
    store,
    view,
    familiarsEnabled: () => enabled,
    ensureOpenSession: vi.fn(async (id: string) => (open ? { ...testSession("claude", "/work/x"), id } : null)),
    setSidebarTab: vi.fn(),
    selectHistorySession: vi.fn(async () => undefined),
  };
  return { deps, view, store, familiars: createFamiliarActions(deps) };
}

describe("createFamiliarActions", () => {
  it("toggles with the current enabled flag", () => {
    const { view, familiars } = setup(true, false);

    familiars.toggle();

    expect(view.toggle).toHaveBeenCalledWith(false);
  });

  it("creates a Familiar, opens its settings and its view", () => {
    const { view, store, familiars } = setup();

    familiars.create(["/work/x"]);

    expect(store.getState().familiarSettingsFor).toBe("fam");
    expect(view.open).toHaveBeenCalledWith("fam");
  });

  it("leaves the Familiar for a launched session in its project", async () => {
    const { deps, view, familiars } = setup();

    await familiars.openLaunchedInWorkspace("s");

    expect(view.close).toHaveBeenCalled();
    expect(deps.setSidebarTab).toHaveBeenCalledWith("sessions", "/work/x");
    expect(deps.selectHistorySession).toHaveBeenCalledWith("s");
  });

  it("stays in the Familiar when the launched session is gone", async () => {
    const { deps, view, familiars } = setup(false);

    await expect(familiars.openLaunchedInWorkspace("s")).rejects.toThrow("no longer available");
    expect(view.close).not.toHaveBeenCalled();
    expect(deps.selectHistorySession).not.toHaveBeenCalled();
  });

  it("shows the session a turn launched beside the Familiar's chat", () => {
    const { view, familiars } = setup();

    familiars.showLaunchedFromTurn("fs", "t", [], "launched");

    expect(view.showLaunchedSession).toHaveBeenCalledWith("fs", "launched");
  });
});
