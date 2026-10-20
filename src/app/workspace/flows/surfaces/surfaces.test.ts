import { describe, expect, it, vi } from "vitest";
import type { LocalSurfaceId } from "@/features/home/ui/LocalSurfaceRailActions";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { openAppView, openFilePicker, railBack, railForward } from "./overlay-views";
import { closeSettings, openSettings } from "./settings-surface";
import type { SurfaceDeps } from "./surface-deps";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  startTransition: (run: () => void) => run(),
}));

function setup() {
  const store = createWorkspaceStore(testWorkspaceState());
  let automations = false;
  let local: LocalSurfaceId | null = null;
  const deps = {
    store,
    setAutomationsViewOpen: vi.fn((open: boolean) => {
      automations = open;
      if (!open) local = null;
    }),
    setAutomationsSurfaceOpen: vi.fn(),
    setLocalSurface: vi.fn(),
    automationsSurfaceOpen: () => automations,
    localSurface: () => local,
    settingsReturnView: {
      current: { search: false, inbox: false, notes: false, automations: false, localSurface: null },
    },
    rememberAppView: vi.fn(),
    cancelNavigation: vi.fn(),
    closeFamiliarView: vi.fn(),
    setSidebarTab: vi.fn(),
    setComposerFocused: vi.fn(),
    visitBack: vi.fn(),
    visitForward: vi.fn(),
    ensureOpenSession: vi.fn(async () => undefined),
    selectHistorySession: vi.fn(async () => undefined),
  } satisfies SurfaceDeps;
  return { deps, store };
}

describe("app views", () => {
  it("opens one view at a time and remembers it as a tab", () => {
    const { deps, store } = setup();

    openAppView(deps, "search");
    openAppView(deps, "inbox");

    expect(store.getState()).toMatchObject({ searchViewOpen: false, inboxViewOpen: true });
    expect(deps.rememberAppView).toHaveBeenLastCalledWith("inbox");
    expect(deps.closeFamiliarView).toHaveBeenCalled();
  });

  it("opens the command palette as a file picker query", () => {
    const { deps, store } = setup();

    openFilePicker(deps, ">");

    expect(store.getState()).toMatchObject({ filePickerOpen: true, filePickerInitialQuery: ">" });
  });

  it("goes back out of the open view before visiting the previous tab", () => {
    const { deps, store } = setup();
    openAppView(deps, "notes");
    const notesOpen = store.getState().notesViewOpen;

    railBack(deps, () => undefined);
    railBack(deps, () => undefined);

    expect(store.getState().notesViewOpen).toBe(false);
    expect(deps.visitBack).toHaveBeenCalledTimes(notesOpen ? 1 : 2);
  });

  it("goes forward after leaving every view", () => {
    const { deps, store } = setup();
    openAppView(deps, "search");

    railForward(deps);

    expect(store.getState().searchViewOpen).toBe(false);
    expect(deps.visitForward).toHaveBeenCalled();
  });
});

describe("settings", () => {
  it("returns to the view it covered", () => {
    const { deps, store } = setup();
    openAppView(deps, "inbox");

    openSettings(deps, "inbox");
    expect(store.getState()).toMatchObject({ settingsOpen: true, inboxViewOpen: false, settingsSection: "inbox" });

    closeSettings(deps);
    expect(store.getState()).toMatchObject({ settingsOpen: false, inboxViewOpen: true });
  });
});
