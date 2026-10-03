import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  announce: vi.fn(),
  check: vi.fn(),
  downloadAndInstall: vi.fn(),
  getVersion: vi.fn(),
  message: vi.fn(),
  relaunch: vi.fn(),
  remember: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion: mocks.getVersion }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  message: mocks.message,
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: mocks.check }));
vi.mock("../../features/settings/model/sounds", () => ({ announceUpdateAvailable: mocks.announce }));
vi.mock("./updateNotice", () => ({ rememberInstalledUpdate: mocks.remember }));
vi.mock("./forkPolicy", () => ({ APP_UPDATER_DISABLED: false }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.getVersion.mockResolvedValue("0.1.22");
  mocks.relaunch.mockResolvedValue(undefined);
  mocks.message.mockResolvedValue(undefined);
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

  it("does not record when no update is pending", async () => {
    const updater = await import("./updater");

    expect((await updater.installPendingUpdate()).phase).toBe("idle");
    expect(mocks.remember).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});
