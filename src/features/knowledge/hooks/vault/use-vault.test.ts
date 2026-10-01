// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVault } from "./use-vault";
const api = vi.hoisted(() => ({
  vaultStatus: vi.fn(),
  scanVault: vi.fn(),
  connectVault: vi.fn(),
  disconnectVault: vi.fn(),
  cancelVaultScan: vi.fn(),
}));
vi.mock("../../../../platform/tauri/vault", () => api);
const events = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void>(),
);
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(
    async (name: string, handler: (event: { payload: unknown }) => void) => {
      events.set(name, handler);
      return () => events.delete(name);
    },
  ),
}));
let root: Root;
let state: ReturnType<typeof useVault>;
const connection = { id: "id", root: "/vault", name: "Vault" };
const snapshot = {
  connection,
  notes: [],
  entries: [],
  warnings: [],
  truncated: false,
};
function Probe() {
  state = useVault();
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  api.vaultStatus.mockReset().mockResolvedValue(connection);
  api.scanVault.mockReset().mockResolvedValue(snapshot);
  api.connectVault.mockReset();
  api.disconnectVault.mockReset().mockResolvedValue(undefined);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("restores the connection, refreshes while visible, and stops polling on unmount", async () => {
  await act(async () => root.render(createElement(Probe)));
  expect(api.scanVault).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTime(30_000));
  expect(api.scanVault).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "hidden",
  });
  await act(async () => vi.advanceTimersByTime(30_000));
  expect(api.scanVault).toHaveBeenCalledTimes(2);
  await act(async () => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  root = createRoot(document.createElement("div"));
});
it("surfaces connection failure and leaves onboarding available", async () => {
  api.vaultStatus.mockResolvedValue(null);
  await act(async () => root.render(createElement(Probe)));
  api.connectVault.mockRejectedValue(new Error("Vault is not readable"));
  await act(async () => state.connect("/missing"));
  expect(state.error).toContain("Vault is not readable");
  expect(state.connection).toBeNull();
  expect(state.busy).toBe(false);
});
it("retains the previous snapshot on refresh failure", async () => {
  await act(async () => root.render(createElement(Probe)));
  api.scanVault.mockRejectedValue(new Error("Scan failed"));
  await act(async () => state.refresh());
  expect(state.snapshot).toEqual(snapshot);
  expect(state.error).toContain("Scan failed");
});
it("joins an in-flight scan after Knowledge is closed and reopened", async () => {
  let finish: (value: typeof snapshot) => void = () => {};
  api.scanVault.mockReturnValue(
    new Promise<typeof snapshot>((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => root.render(createElement(Probe)));
  await act(async () => root.unmount());

  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe)));
  await act(async () => finish(snapshot));

  expect(api.scanVault).toHaveBeenCalledTimes(1);
  expect(state.snapshot).toEqual(snapshot);
  expect(state.scanBusy).toBe(false);
});

it("follows connection changes made in another window", async () => {
  await act(async () => root.render(createElement(Probe)));
  const changed = events.get("knowledge:connection-changed");
  const next = { id: "next", root: "/next", name: "Next" };

  await act(async () => changed?.({ payload: null }));
  expect(state.connection).toBeNull();
  expect(state.snapshot).toBeNull();

  await act(async () => changed?.({ payload: next }));
  expect(state.connection).toEqual(next);
  expect(api.scanVault).toHaveBeenLastCalledWith("next");

  await act(async () => changed?.({ payload: { id: 1 } }));
  expect(state.connection).toEqual(next);
  expect(state.error).toBeTruthy();
});
