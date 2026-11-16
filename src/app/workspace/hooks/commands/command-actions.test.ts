import { describe, expect, it } from "vitest";
import { fakeWorkspaceHandlers } from "../../testing/workspace-handlers";
import { commandActions } from "./command-actions";

describe("commandActions", () => {
  it("runs shortcuts and menu commands through the workspace handlers", () => {
    const handlers = fakeWorkspaceHandlers();
    const actions = commandActions(handlers);

    expect(actions.onCloseFocused).toBe(handlers.visibleTabs.closeVisibleTab);
    expect(actions.onActivate).toBe(handlers.visibleTabs.activateVisibleTab);
    expect(actions.onToggleFamiliar).toBe(handlers.familiars.toggle);
    expect(actions.pickProject).toBe(handlers.projects.pick);
    expect(actions.onOpenApprovalSession).toBe(handlers.workerPanes.openSession);
  });

  it("cycles the visible tabs forward and back", () => {
    const handlers = fakeWorkspaceHandlers();
    const actions = commandActions(handlers);

    actions.onNext();
    actions.onPrev();

    expect(handlers.visibleTabs.cycleVisibleTab).toHaveBeenNthCalledWith(1, 1);
    expect(handlers.visibleTabs.cycleVisibleTab).toHaveBeenNthCalledWith(2, -1);
  });
});
