import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  announce: vi.fn(),
  alertApp: vi.fn(),
  ask: vi.fn(),
  check: vi.fn(),
  downloadAndInstall: vi.fn(),
  getVersion: vi.fn(),
  relaunch: vi.fn(),
  openPrompt: vi.fn(),
  remember: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("@/features/settings/model/sounds", () => ({ announceUpdateAvailable: mocks.announce }));
vi.mock("@/shared/lib/app-dialog", () => ({ alertApp: mocks.alertApp }));
vi.mock("./update-prompt", () => ({ openUpdatePrompt: mocks.openPrompt }));
vi.mock("./update-notice", () => ({ rememberInstalledUpdate: mocks.remember }));
vi.mock("./fork-policy", () => ({ APP_UPDATER_DISABLED: false }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.getVersion.mockResolvedValue("0.1.22");
  mocks.relaunch.mockResolvedValue(undefined);
  mocks.alertApp.mockResolvedValue(undefined);
});

async function updaterWithPendingUpdate() {
  const update = {
    version: "0.1.23",
    downloadAndInstall: mocks.downloadAndInstall,
  };
  mocks.check.mockResolvedValue(update);
  const updater = await import("./updater");
  await updater.probeForUpdate();
  return updater;
}

describe("probeForUpdate", () => {
  it("bounds the check so a stalled request cannot pin the phase", async () => {
    mocks.check.mockResolvedValue(null);
    const updater = await import("./updater");

    await updater.probeForUpdate();

    expect(mocks.check).toHaveBeenCalledWith({ timeout: 30_000 });
  });

  it("skips the check while an install is downloading", async () => {
    mocks.downloadAndInstall.mockReturnValue(new Promise(() => {}));
    const updater = await updaterWithPendingUpdate();
    void updater.installPendingUpdate();
    await vi.waitFor(() => expect(mocks.downloadAndInstall).toHaveBeenCalledOnce());

    await expect(updater.probeForUpdate()).resolves.toBeNull();

    expect(mocks.check).toHaveBeenCalledOnce();
  });
});

describe("installPendingUpdate", () => {
  it("starts one download when two surfaces install at once", async () => {
    mocks.downloadAndInstall.mockResolvedValue(undefined);
    const updater = await updaterWithPendingUpdate();

    const [first, second] = await Promise.all([
      updater.installPendingUpdate(),
      updater.installPendingUpdate(),
    ]);

    expect(mocks.downloadAndInstall).toHaveBeenCalledOnce();
    expect(first.phase).toBe("current");
    expect(second.phase).toBe("downloading");
  });

  it("allows a retry after a failed install", async () => {
    mocks.downloadAndInstall.mockRejectedValueOnce(new Error("offline"));
    const updater = await updaterWithPendingUpdate();

    await updater.installPendingUpdate();
    mocks.downloadAndInstall.mockResolvedValue(undefined);
    const retry = await updater.installPendingUpdate();

    expect(mocks.downloadAndInstall).toHaveBeenCalledTimes(2);
    expect(retry.phase).toBe("current");
  });

  it("records a successful installation before relaunching", async () => {
    mocks.downloadAndInstall.mockResolvedValue(undefined);
    const updater = await updaterWithPendingUpdate();

    await updater.installPendingUpdate();

    expect(mocks.remember).toHaveBeenCalledWith("0.1.23");
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(mocks.remember.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.relaunch.mock.invocationCallOrder[0]!,
    );
  });

  it("does not record or relaunch after installation fails", async () => {
    mocks.downloadAndInstall.mockRejectedValue(new Error("install failed"));
    const updater = await updaterWithPendingUpdate();

    const result = await updater.installPendingUpdate();

    expect(result.phase).toBe("error");
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });

  it("can leave install failures to the caller", async () => {
    mocks.downloadAndInstall.mockRejectedValue(new Error("offline"));
    const updater = await updaterWithPendingUpdate();

    const result = await updater.installPendingUpdate(undefined, {
      reportFailure: false,
    });

    expect(result).toMatchObject({ phase: "error", error: "offline" });
    expect(mocks.alertApp).not.toHaveBeenCalled();
  });

  it("refuses a prompted version that is no longer pending", async () => {
    const updater = await updaterWithPendingUpdate();

    const result = await updater.installPendingUpdate(undefined, {
      version: "0.1.21",
    });

    expect(result).toMatchObject({
      phase: "error",
      availableVersion: "0.1.23",
      error: expect.stringContaining("0.1.21 is no longer the pending update"),
    });
    expect(mocks.downloadAndInstall).not.toHaveBeenCalled();
  });

  it("refuses a prompted version once nothing is pending", async () => {
    const updater = await import("./updater");

    const result = await updater.installPendingUpdate(undefined, {
      version: "0.1.23",
    });

    expect(result.phase).toBe("error");
    expect(mocks.downloadAndInstall).not.toHaveBeenCalled();
  });

  it("installs when the prompted version is still pending", async () => {
    mocks.downloadAndInstall.mockResolvedValue(undefined);
    const updater = await updaterWithPendingUpdate();

    const result = await updater.installPendingUpdate(undefined, {
      version: "0.1.23",
    });

    expect(result.phase).toBe("current");
    expect(mocks.downloadAndInstall).toHaveBeenCalledOnce();
  });

  it("does not record when no update is pending", async () => {
    const updater = await import("./updater");

    expect((await updater.installPendingUpdate()).phase).toBe("idle");
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});

describe("runUpdateFlow", () => {
  it("opens the in-app prompt instead of a native dialog on a manual check", async () => {
    mocks.check.mockResolvedValue({
      version: "0.1.23",
      date: "2026-10-03 14:18:46.976 +00:00:00",
      body: "  ### Added\n\n- Thing  ",
      downloadAndInstall: mocks.downloadAndInstall,
    });
    const onProgress = vi.fn();
    const updater = await import("./updater");

    const result = await updater.runUpdateFlow(true, onProgress);

    expect(result.phase).toBe("available");
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(mocks.downloadAndInstall).not.toHaveBeenCalled();
    expect(mocks.openPrompt).toHaveBeenCalledWith({
      version: "0.1.23",
      currentVersion: "0.1.22",
      date: "3 Oct 2026",
      notes: "### Added\n\n- Thing",
      onProgress,
    });
  });

  it("does not open the prompt on a background check", async () => {
    mocks.check.mockResolvedValue({
      version: "0.1.23",
      downloadAndInstall: mocks.downloadAndInstall,
    });
    const updater = await import("./updater");

    await updater.runUpdateFlow(false);

    expect(mocks.openPrompt).not.toHaveBeenCalled();
  });

  it("passes missing notes and date as null", async () => {
    mocks.check.mockResolvedValue({
      version: "0.1.23",
      body: "   ",
      downloadAndInstall: mocks.downloadAndInstall,
    });
    const updater = await import("./updater");

    await updater.runUpdateFlow(true);

    expect(mocks.openPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ date: null, notes: null }),
    );
  });
});

describe("runUpdateFlow while an install is downloading", () => {
  async function updaterMidInstall() {
    mocks.downloadAndInstall.mockReturnValue(new Promise(() => {}));
    const updater = await updaterWithPendingUpdate();
    void updater.installPendingUpdate();
    await vi.waitFor(() =>
      expect(mocks.downloadAndInstall).toHaveBeenCalledOnce(),
    );

    return updater;
  }

  it("skips the check and tells a manual caller", async () => {
    const updater = await updaterMidInstall();
    const onProgress = vi.fn();

    const result = await updater.runUpdateFlow(true, onProgress);

    expect(result).toMatchObject({
      phase: "downloading",
      availableVersion: "0.1.23",
    });
    expect(mocks.check).toHaveBeenCalledOnce();
    expect(mocks.openPrompt).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
    expect(mocks.alertApp).toHaveBeenCalledOnce();
  });

  it("stays silent on a background check", async () => {
    const updater = await updaterMidInstall();

    await updater.runUpdateFlow(false);

    expect(mocks.check).toHaveBeenCalledOnce();
    expect(mocks.alertApp).not.toHaveBeenCalled();
  });
});
