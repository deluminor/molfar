// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitDiffIndex } from "../../../platform/tauri/fs";
import { useGitPulse, type GitPulseState } from "./useGitPulse";

const mocks = vi.hoisted(() => ({
  gitDiffIndex: vi.fn(),
  gitHeadMessage: vi.fn(),
}));

vi.mock("../../../platform/tauri/fs", () => ({
  gitDiffIndex: mocks.gitDiffIndex,
  gitHeadMessage: mocks.gitHeadMessage,
}));

const CLEAN: GitDiffIndex = {
  branch: "main",
  head: "abc1234",
  files: [],
  additions: 0,
  deletions: 0,
  remote: "origin",
  upstream: "origin/main",
  defaultBranch: "main",
  ahead: 0,
  behind: 0,
  aheadOfDefault: 0,
  headPushed: true,
};

let container: HTMLDivElement;
let root: Root;
let latest: GitPulseState | null = null;

function Probe({ cwd, enabled = true }: { cwd: string; enabled?: boolean }) {
  latest = useGitPulse(cwd, enabled);
  return null;
}

async function render(cwd: string, enabled = true): Promise<void> {
  await act(async () => {
    root.render(createElement(Probe, { cwd, enabled }));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.gitDiffIndex.mockReset();
  mocks.gitHeadMessage.mockReset();
  mocks.gitHeadMessage.mockResolvedValue("subject");
  container = document.createElement("div");
  root = createRoot(container);
  latest = null;
});

afterEach(async () => {
  await act(async () => root.unmount());
  latest = null;
  vi.unstubAllGlobals();
});

describe("useGitPulse", () => {
  it("maps invoke failures to error, not unavailable", async () => {
    mocks.gitDiffIndex.mockRejectedValueOnce(new Error("permission denied"));
    await render("/repo");
    await flush();
    expect(latest).toEqual({ status: "error" });
  });

  it("maps a repo without a head to unavailable", async () => {
    mocks.gitDiffIndex.mockResolvedValueOnce({
      ...CLEAN,
      branch: null,
      head: null,
    });
    await render("/repo");
    await flush();
    expect(latest).toEqual({ status: "unavailable" });
  });

  it("ignores a stale focus refresh that resolves after a newer one", async () => {
    let resolveSlow: ((value: GitDiffIndex) => void) | undefined;
    mocks.gitDiffIndex.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSlow = resolve;
        }),
    );
    mocks.gitDiffIndex.mockResolvedValueOnce({
      ...CLEAN,
      branch: "fresh",
    });

    await render("/repo");
    expect(latest).toEqual({ status: "loading" });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await flush();

    expect(latest).toMatchObject({
      status: "ready",
      pulse: { branch: "fresh" },
    });

    await act(async () => {
      resolveSlow?.(CLEAN);
      await Promise.resolve();
    });

    expect(latest).toMatchObject({
      status: "ready",
      pulse: { branch: "fresh" },
    });
  });
});
