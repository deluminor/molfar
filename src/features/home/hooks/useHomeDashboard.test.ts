// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHomeDashboard, type HomeDashboardState } from "./useHomeDashboard";

const mocks = vi.hoisted(() => ({ loadHomeDashboard: vi.fn() }));

vi.mock("../model/homeData", () => ({
  loadHomeDashboard: mocks.loadHomeDashboard,
}));

let container: HTMLDivElement;
let root: Root;
let latest: HomeDashboardState | null = null;

function Probe({ paths }: { paths: readonly string[] }) {
  latest = useHomeDashboard(paths);
  return null;
}

async function render(paths: readonly string[]): Promise<void> {
  await act(async () => {
    root.render(createElement(Probe, { paths }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.loadHomeDashboard.mockReset();
  mocks.loadHomeDashboard.mockResolvedValue({
    status: null,
    sessions: [],
    automations: [],
  });
  container = document.createElement("div");
  root = createRoot(container);
  latest = null;
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("useHomeDashboard", () => {
  it("does not reload when the caller rebuilds an identical path list", async () => {
    await render(["/a", "/b"]);
    await render(["/a", "/b"]);

    expect(mocks.loadHomeDashboard).toHaveBeenCalledTimes(1);
  });

  it("reloads when the project list changes", async () => {
    await render(["/a"]);
    await render(["/a", "/b"]);

    expect(mocks.loadHomeDashboard).toHaveBeenCalledTimes(2);
    expect(mocks.loadHomeDashboard).toHaveBeenLastCalledWith(["/a", "/b"]);
  });

  it("surfaces one error for every card and clears the lists", async () => {
    mocks.loadHomeDashboard.mockRejectedValue(new Error("scan failed"));

    await render(["/a"]);

    expect(latest).toEqual({
      status: null,
      sessions: [],
      automations: [],
      error: "scan failed",
    });
  });
});
