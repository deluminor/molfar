import { describe, expect, it, vi } from "vitest";
import { fakeFlowCore } from "./flow-core.fixture";
import { createHistoryFlows } from "./use-history-flows";
import { createTabFlows } from "./use-tab-flows";

vi.mock("@/features/updates/model/update-prompt", () => ({ getUpdatePrompt: () => null }));
vi.mock("@/shared/lib/app-dialog", () => ({ getAppDialog: () => null, alertApp: vi.fn(), confirmApp: vi.fn() }));

const archiveFocusedSession = vi.hoisted(() => vi.fn());
vi.mock("@/features/sessions/model/archive-shortcut", () => ({ archiveFocusedSession }));

const event = {} as KeyboardEvent;

function setup(automationsOpen = false) {
  const core = fakeFlowCore({ projectTerminalFocused: !automationsOpen });
  const tabFlows = createTabFlows(core, {
    terminalCwdRef: { current: "~" },
    displayedTabNavigation: { current: { tabs: [], activeId: "" } },
  });
  const flows = createHistoryFlows(core, {
    tabFlows,
    deleteConfirmationPending: { current: false },
    automationsViewOpenRef: { current: automationsOpen },
  });

  return { core, flows };
}

describe("createHistoryFlows", () => {
  it("hands the worktree flows the store's terminals and the Workspace's pins", () => {
    const { core, flows } = setup();

    expect(flows.worktreeDeps.projectTerminals()).toBe(core.store.getState().projectTerminals);
    expect(flows.worktreeDeps.workspacePins).toBe(core.workspacePins);
    flows.worktreeDeps.focusComposer();
    expect(core.setComposerFocused).toHaveBeenCalledWith(true);
  });

  it("reads the archive context from the store when the shortcut fires", () => {
    const { core, flows } = setup();
    core.store.getState().setSearchViewOpen(true);

    flows.historyActions.archiveFocused(event);

    expect(archiveFocusedSession).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ projectTerminalFocused: true, surfaceOpen: true }),
      expect.any(Function),
    );
  });

  it("counts the automations view as a covering surface", () => {
    const { flows } = setup(true);

    flows.historyActions.archiveFocused(event);

    expect(archiveFocusedSession).toHaveBeenLastCalledWith(
      event,
      expect.objectContaining({ projectTerminalFocused: false, surfaceOpen: true }),
      expect.any(Function),
    );
  });
});
