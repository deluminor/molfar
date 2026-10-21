import { describe, expect, it, vi } from "vitest";
import { leafIds, newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { placeSessionOnPane, type PlaceSessionDeps } from "./place-session";

vi.mock("@/integrations/harness", () => ({ forgetHarnessSession: vi.fn(async () => undefined) }));

function setup(targetBlank = false) {
  const sessions = ["a", "b"].map((id) => ({
    ...testSession("claude", "/work/demo"),
    id,
    blocks: id === "a" && !targetBlank ? [{ id: "m", role: "user" as const, text: "hi" }] : [],
  }));
  const tabs: WorkspaceTab[] = [{ ...newTab("a"), id: "t1" }];
  const store = createWorkspaceStore(testWorkspaceState({ sessions, tabs }));
  const deps = {
    store,
    sessionsRef: { current: sessions },
    tabsRef: { current: tabs },
    persistence: { forgetSaved: vi.fn() },
    scope: "project",
    projectCwd: () => "/work/demo",
    ensureOpenSession: vi.fn(async (id: string) => sessions.find((entry) => entry.id === id)),
    setSessions: vi.fn(),
    selectTab: vi.fn(),
    setComposerFocused: vi.fn(),
  } satisfies PlaceSessionDeps;
  return { deps, store };
}

describe("placeSessionOnPane", () => {
  it("splits the target pane with the dropped session and focuses it", async () => {
    const { deps, store } = setup();

    await placeSessionOnPane(deps, "b", "a", "right");

    expect(leafIds(store.getState().tabs[0].layout).sort()).toEqual(["a", "b"]);
    expect(deps.selectTab).toHaveBeenCalledWith("t1");
    expect(deps.setComposerFocused).toHaveBeenCalledWith(true);
  });

  it("replaces a blank target pane and forgets its saved draft", async () => {
    const { deps, store } = setup(true);

    await placeSessionOnPane(deps, "b", "a", "right");

    expect(leafIds(store.getState().tabs[0].layout)).toEqual(["b"]);
    expect(deps.persistence.forgetSaved).toHaveBeenCalledWith("a");
  });

  it("ignores a drop onto itself or an unknown pane", async () => {
    const { deps } = setup();

    await placeSessionOnPane(deps, "a", "a", "right");
    await placeSessionOnPane(deps, "b", "missing", "right");

    expect(deps.ensureOpenSession).not.toHaveBeenCalled();
    expect(deps.setSessions).not.toHaveBeenCalled();
  });

  it("does nothing when the session cannot be loaded", async () => {
    const { deps } = setup();
    deps.ensureOpenSession.mockResolvedValue(undefined);

    await placeSessionOnPane(deps, "b", "a", "left");

    expect(deps.setSessions).not.toHaveBeenCalled();
  });
});
