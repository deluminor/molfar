import { describe, expect, it, vi } from "vitest";
import { testSession } from "@/integrations/harness/core/test-session";
import { openAppView, openConversation, openFilePicker, railBack, railForward } from "./overlay-views";
import { closeSettings, openSettings } from "./settings-surface";
import { setupSurfaces } from "./surface.fixture";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  startTransition: (run: () => void) => run(),
}));

describe("app views", () => {
  it("opens one view at a time and remembers it as a tab", () => {
    const { deps, store } = setupSurfaces();

    openAppView(deps, "search");
    openAppView(deps, "inbox");

    expect(store.getState()).toMatchObject({ searchViewOpen: false, inboxViewOpen: true });
    expect(deps.rememberAppView).toHaveBeenLastCalledWith("inbox");
    expect(deps.closeFamiliarView).toHaveBeenCalled();
  });

  it("opens the command palette as a file picker query", () => {
    const { deps, store } = setupSurfaces();

    openFilePicker(deps, ">");

    expect(store.getState()).toMatchObject({ filePickerOpen: true, filePickerInitialQuery: ">" });
  });

  it("goes back out of the open view before visiting the previous tab", () => {
    const { deps, store } = setupSurfaces();
    openAppView(deps, "notes");
    const notesOpen = store.getState().notesViewOpen;

    railBack(deps, () => undefined);
    railBack(deps, () => undefined);

    expect(store.getState().notesViewOpen).toBe(false);
    expect(deps.visitBack).toHaveBeenCalledTimes(notesOpen ? 1 : 2);
  });

  it("goes forward after leaving every view", () => {
    const { deps, store } = setupSurfaces();
    openAppView(deps, "search");

    railForward(deps);

    expect(store.getState().searchViewOpen).toBe(false);
    expect(deps.visitForward).toHaveBeenCalled();
  });
});

describe("settings", () => {
  it("returns to the view it covered", () => {
    const { deps, store } = setupSurfaces();
    openAppView(deps, "inbox");

    openSettings(deps, "inbox");
    expect(store.getState()).toMatchObject({ settingsOpen: true, inboxViewOpen: false, settingsSection: "inbox" });

    closeSettings(deps);
    expect(store.getState()).toMatchObject({ settingsOpen: false, inboxViewOpen: true });
  });
});

describe("openConversation", () => {
  it("leaves every view for the conversation in its project", async () => {
    const { deps, store } = setupSurfaces();
    store.setState({ searchViewOpen: true, settingsOpen: true, filePickerOpen: true });
    deps.ensureOpenSession.mockResolvedValue({ ...testSession("claude", "/work/other"), id: "s" } as never);

    await openConversation(deps, "s");

    expect(store.getState()).toMatchObject({
      searchViewOpen: false,
      inboxViewOpen: false,
      notesViewOpen: false,
      settingsOpen: false,
      filePickerOpen: false,
      projectCwd: "/work/other",
    });
    expect(deps.setAutomationsViewOpen).toHaveBeenCalledWith(false);
    expect(deps.setSidebarTab).toHaveBeenCalledWith("sessions", "/work/other");
    expect(deps.selectHistorySession).toHaveBeenCalledWith("s");
  });

  it("refuses a conversation that is gone and keeps the views", async () => {
    const { deps, store } = setupSurfaces();
    store.setState({ searchViewOpen: true });

    await expect(openConversation(deps, "s")).rejects.toThrow("no longer available");
    expect(store.getState().searchViewOpen).toBe(true);
    expect(deps.selectHistorySession).not.toHaveBeenCalled();
  });
});
