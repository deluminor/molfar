import { afterEach, describe, expect, it, vi } from "vitest";

const { getVersion, check, message } = vi.hoisted(() => ({
  getVersion: vi.fn(),
  check: vi.fn(),
  message: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({ getVersion }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), message }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("../../features/settings/model/sounds", () => ({
  announceUpdateAvailable: vi.fn(),
}));
vi.mock("./forkPolicy", () => ({ APP_UPDATER_DISABLED: true }));

import {
  installPendingUpdate,
  probeForUpdate,
  runUpdateFlow,
} from "./updater";

describe("fork updater kill-switch", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("never calls the release feed", async () => {
    getVersion.mockResolvedValue("0.6.0");

    await expect(probeForUpdate()).resolves.toBeNull();
    await expect(runUpdateFlow(false)).resolves.toEqual({
      phase: "idle",
      currentVersion: "0.6.0",
    });
    await expect(runUpdateFlow(true)).resolves.toEqual({
      phase: "idle",
      currentVersion: "0.6.0",
    });
    await expect(installPendingUpdate()).resolves.toEqual({
      phase: "idle",
      currentVersion: "0.6.0",
    });

    expect(check).not.toHaveBeenCalled();
    expect(message).toHaveBeenCalledWith(
      expect.stringContaining("disabled in this fork"),
      { title: "Vatra" },
    );
  });
});
