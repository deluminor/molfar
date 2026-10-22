import { describe, expect, it, vi } from "vitest";
import { alertApp } from "@/shared/lib/app-dialog";
import { createSurfaceActions } from "./surface-actions";
import { setupSurfaces } from "./surface.fixture";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  startTransition: (run: () => void) => run(),
}));
vi.mock("@/shared/lib/app-dialog", () => ({ alertApp: vi.fn(async () => undefined) }));
vi.mock("@/features/updates/model/release-notes", () => ({
  releaseNotesForVersion: (version: string) =>
    version === "1.2.3" ? { source: { version: "1.2.3" }, markdown: "" } : null,
}));

describe("createSurfaceActions", () => {
  it("opens and leaves the app views", () => {
    const { deps, store } = setupSurfaces();
    const surfaces = createSurfaceActions(deps);

    surfaces.openInbox();
    expect(store.getState().inboxViewOpen).toBe(true);
    surfaces.leaveInbox();
    expect(store.getState().inboxViewOpen).toBe(false);

    surfaces.openAutomations();
    surfaces.leaveAutomations();
    expect(deps.setAutomationsViewOpen).toHaveBeenLastCalledWith(false);
  });

  it("opens Settings on the asked section and its shortcuts", () => {
    const { deps, store } = setupSurfaces();
    const surfaces = createSurfaceActions(deps);

    surfaces.manageWorktrees();
    expect(store.getState()).toMatchObject({ settingsOpen: true, settingsSection: "worktrees" });

    surfaces.openInboxIntegrations("github");
    expect(store.getState()).toMatchObject({ settingsSection: "inbox", settingsAnchor: "github" });

    surfaces.closeSettings();
    expect(store.getState().settingsOpen).toBe(false);
  });

  it("leaves Settings to open an archived session", () => {
    const { deps, store } = setupSurfaces();
    const surfaces = createSurfaceActions(deps);
    surfaces.openSettingsHome();

    surfaces.openArchivedSession("s1");

    expect(store.getState().settingsOpen).toBe(false);
    expect(deps.selectHistorySession).toHaveBeenCalledWith("s1");
  });

  it("opens the remote project dialog and the command palette", () => {
    const { deps, store } = setupSurfaces();
    const surfaces = createSurfaceActions(deps);

    surfaces.openRemoteProjectDialog();
    surfaces.openCommandPalette();

    expect(store.getState()).toMatchObject({
      remoteProjectDialogOpen: true,
      filePickerOpen: true,
      filePickerInitialQuery: ">",
    });
  });

  it("opens What's New for a bundled version and explains a missing one", () => {
    const { deps, store } = setupSurfaces();
    const surfaces = createSurfaceActions(deps);

    surfaces.openWhatsNew("9.9.9");
    expect(alertApp).toHaveBeenCalledOnce();
    expect(store.getState().whatsNewVersion).toBeNull();

    surfaces.openWhatsNew("1.2.3");
    expect(store.getState().whatsNewVersion).toBe("1.2.3");
  });
});
