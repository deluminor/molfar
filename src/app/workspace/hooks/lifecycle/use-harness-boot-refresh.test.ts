// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { mountHook } from "../../testing/mount-hook";
import { useHarnessBootRefresh } from "./use-harness-boot-refresh";

const mocks = vi.hoisted(() => ({
  probe: vi.fn(async () => undefined),
  refresh: vi.fn(async (_harnesses: string[]) => undefined),
}));

vi.mock("@/integrations/harness", () => ({
  probeHarnessAvailability: mocks.probe,
  refreshHarnessCatalogs: mocks.refresh,
  isLiveHarness: (harness: string) => harness !== "fake",
}));
vi.mock("@/integrations/harness/core/models/resolve-model", () => ({
  resolveModel: (_harness: string, model: string) => ({ id: model === "old" ? "new" : model, defaults: { effort: "high" } }),
  mergeModelSettings: (resolved: { defaults: Record<string, string> }, settings?: Record<string, string>) => ({
    ...resolved.defaults,
    ...settings,
  }),
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => vi.clearAllMocks());

const chat = (id: string, harness: string, model: string, modelSettings?: Record<string, string>): Session =>
  ({ id, harness, model, modelSettings }) as unknown as Session;

describe("useHarnessBootRefresh", () => {
  it("probes once and refreshes only the harnesses already open", async () => {
    const setSessions = vi.fn();
    const sessionsRef = { current: [chat("a", "codex", "m"), chat("b", "codex", "m"), chat("c", "fake", "m")] };
    const { rerender } = mountHook(() => useHarnessBootRefresh(sessionsRef, setSessions));
    rerender();
    await act(async () => undefined);

    expect(mocks.probe).toHaveBeenCalledTimes(1);
    expect(mocks.refresh.mock.calls).toEqual([[["codex", "fake"]]]);
    expect(setSessions).toHaveBeenCalledTimes(1);
  });

  it("resolves live chats' models and settings, keeping unchanged ones as they are", async () => {
    const setSessions = vi.fn();
    const sessionsRef = { current: [] };
    mountHook(() => useHarnessBootRefresh(sessionsRef, setSessions));
    await act(async () => undefined);
    const unchanged = chat("a", "codex", "m", { effort: "high" });
    const stale = chat("b", "codex", "old");
    const offline = chat("c", "fake", "old");

    const next = setSessions.mock.calls[0]?.[0]([unchanged, stale, offline]);

    expect(next[0]).toBe(unchanged);
    expect(next[1]).toEqual({ ...stale, model: "new", modelSettings: { effort: "high" } });
    expect(next[2]).toBe(offline);
  });
});
