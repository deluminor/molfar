import { describe, expect, it, vi } from "vitest";
import type { SessionOpenerFlows } from "./use-session-opener-flows";
import { fakeFlowCore } from "./flow-core.fixture";
import { createSurfaceFlows } from "./use-surface-flows";

function setup() {
  const core = fakeFlowCore();
  const tabActions = { visitBack: vi.fn(), visitForward: vi.fn() } as unknown as SessionOpenerFlows["tabActions"];
  const sessionOpeners = {
    ensureOpen: vi.fn(async () => undefined),
    selectHistory: vi.fn(async () => undefined),
  } as unknown as SessionOpenerFlows["sessionOpeners"];
  const input = {
    tabActions,
    sessionOpeners,
    localSurfaces: {
      setAutomationsSurfaceOpen: vi.fn(),
      setLocalSurface: vi.fn(),
      automationsSurfaceOpenRef: { current: true },
      localSurfaceRef: { current: null },
    },
    settingsReturnView: {
      current: { search: false, inbox: false, notes: false, automations: false, localSurface: null },
    },
    rememberAppView: vi.fn(),
    familiarsEnabledRef: { current: true },
    linkedUpdateCards: { update: vi.fn() },
    dismissDueReminder: vi.fn(async () => undefined),
  };

  return { core, input, flows: createSurfaceFlows(core, input) };
}

describe("createSurfaceFlows", () => {
  it("reads the local surfaces at call time and steps through the tab history", () => {
    const { input, flows } = setup();

    expect(flows.surfaceDeps.automationsSurfaceOpen()).toBe(true);
    input.localSurfaces.automationsSurfaceOpenRef.current = false;
    expect(flows.surfaceDeps.automationsSurfaceOpen()).toBe(false);

    flows.surfaceDeps.visitBack();
    flows.surfaceDeps.visitForward();
    expect(input.tabActions.visitBack).toHaveBeenCalledOnce();
    expect(input.tabActions.visitForward).toHaveBeenCalledOnce();
  });

  it("leaves the automations view through the Workspace", () => {
    const { core, flows } = setup();

    flows.surfaces.leaveAutomations();

    expect(core.setAutomationsViewOpen).toHaveBeenCalledWith(false);
  });

  it("dismisses a due reminder through the reminders read later", () => {
    const { input, flows } = setup();

    flows.reminders.dismissContinuedNotices("s");

    expect(input.dismissDueReminder).toHaveBeenCalledWith("s");
  });
});
