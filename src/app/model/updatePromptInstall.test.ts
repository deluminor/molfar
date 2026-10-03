import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdatePrompt } from "./updatePrompt";
import type { UpdaterSnapshot } from "./updater";

const mocks = vi.hoisted(() => ({ install: vi.fn() }));

vi.mock("./updater", () => ({ installPendingUpdate: mocks.install }));

const { installFromPrompt } = await import("./updatePromptInstall");

const DOWNLOADING: UpdaterSnapshot = {
  phase: "downloading",
  currentVersion: "1.0.2",
  availableVersion: "1.0.3",
  progress: 40,
};

function prompt(onProgress?: UpdatePrompt["onProgress"]): UpdatePrompt {
  return {
    version: "1.0.3",
    currentVersion: "1.0.2",
    date: null,
    notes: null,
    onProgress,
  };
}

beforeEach(() => {
  mocks.install.mockReset();
});

describe("installFromPrompt", () => {
  it("installs the prompted version without a native failure dialog", async () => {
    mocks.install.mockResolvedValue(DOWNLOADING);

    await installFromPrompt(prompt(), vi.fn());

    expect(mocks.install).toHaveBeenCalledWith(expect.any(Function), {
      reportFailure: false,
      version: "1.0.3",
    });
  });

  it("forwards progress to the dialog and the prompt opener", async () => {
    const onSnapshot = vi.fn();
    const onProgress = vi.fn();
    mocks.install.mockImplementation(async (report) => {
      report(DOWNLOADING);
      return DOWNLOADING;
    });

    await installFromPrompt(prompt(onProgress), onSnapshot);

    expect(onProgress).toHaveBeenCalledWith(DOWNLOADING);
    expect(onSnapshot).toHaveBeenCalledWith(DOWNLOADING);
  });

  it("reports the result when an install elsewhere is already running", async () => {
    const onSnapshot = vi.fn();
    mocks.install.mockResolvedValue(DOWNLOADING);

    await installFromPrompt(prompt(), onSnapshot);

    expect(onSnapshot).toHaveBeenCalledExactlyOnceWith(DOWNLOADING);
  });

  it("reports install failures to the dialog", async () => {
    const onSnapshot = vi.fn();
    const failed: UpdaterSnapshot = {
      phase: "error",
      currentVersion: "1.0.2",
      error: "offline",
    };
    mocks.install.mockResolvedValue(failed);

    await installFromPrompt(prompt(), onSnapshot);

    expect(onSnapshot).toHaveBeenLastCalledWith(failed);
  });
});
