// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UPDATE_RECHECK_INTERVAL_MS } from "@/features/updates/model/update-recheck";
import { SidebarUpdateFooter } from "./SidebarUpdate";

const updater = vi.hoisted(() => ({
  probeForUpdate: vi.fn(),
  readAppVersion: vi.fn(),
  installPendingUpdate: vi.fn(),
}));

vi.mock("@/features/updates/model/fork-policy", () => ({ APP_UPDATER_DISABLED: false }));
vi.mock("@/features/updates/model/updater", () => updater);

let container: HTMLDivElement;
let root: Root;

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  updater.readAppVersion.mockResolvedValue("1.0.0");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("re-probes on an interval until an update is found, then stops", async () => {
  updater.probeForUpdate
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ version: "1.0.1" });

  act(() => root.render(createElement(SidebarUpdateFooter)));
  await flush();
  expect(updater.probeForUpdate).toHaveBeenCalledTimes(1);
  expect(container.textContent).toBe("");

  await advance(UPDATE_RECHECK_INTERVAL_MS);
  expect(updater.probeForUpdate).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Update to 1.0.1");

  await advance(UPDATE_RECHECK_INTERVAL_MS);
  expect(updater.probeForUpdate).toHaveBeenCalledTimes(2);
});

it("retries after a failed probe and stops polling once unmounted", async () => {
  updater.probeForUpdate.mockRejectedValueOnce(new Error("offline"));
  updater.probeForUpdate.mockResolvedValue(null);

  act(() => root.render(createElement(SidebarUpdateFooter)));
  await flush();
  await advance(UPDATE_RECHECK_INTERVAL_MS);
  expect(updater.probeForUpdate).toHaveBeenCalledTimes(2);

  act(() => root.unmount());
  root = createRoot(container);
  await advance(UPDATE_RECHECK_INTERVAL_MS);
  expect(updater.probeForUpdate).toHaveBeenCalledTimes(2);
});
