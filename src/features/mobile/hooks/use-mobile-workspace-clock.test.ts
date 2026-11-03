// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useMobileWorkspace } from "./use-mobile-workspace";
import type { MobileWatchEvent } from "../types/workspace";

const api = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: MobileWatchEvent }) => void>(),
  invoke: vi.fn(async () => ({ enabled: true })),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, callback: (event: { payload: MobileWatchEvent }) => void) => {
    api.listeners.set(name, callback);
    return () => api.listeners.delete(name);
  }),
}));
vi.mock("../model/mobile-catalog", () => ({ mobileCatalog: async () => ({}) }));
vi.mock("../model/mobile-conversation", () => ({
  mobileConversation: async () => ({
    busy: false,
    turns: [],
    usageLimit: { token: "limit", canResume: Date.now() >= 5000, canAutoResume: Date.now() < 5000 },
  }),
}));

function Host() {
  useMobileWorkspace({ sessions: [], command: async () => ({}) });
  return null;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  api.listeners.clear();
  api.invoke.mockClear();
});

it("refreshes an idle phone watch after the reset clock changes without a session update", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);

  try {
    await act(async () => root.render(createElement(Host)));
    api.listeners.get("molfar-mobile-watch")?.({
      payload: { action: "start", id: "watch", conversationId: "session", incremental: true },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(api.invoke).toHaveBeenCalledWith("mobile_push", expect.objectContaining({
      update: expect.objectContaining({ usageLimit: expect.objectContaining({ canResume: false }) }),
    }));

    await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
    expect(api.invoke).toHaveBeenCalledWith("mobile_push", expect.objectContaining({
      update: expect.objectContaining({ usageLimit: expect.objectContaining({ canResume: true, canAutoResume: false }) }),
    }));
  } finally {
    await act(async () => root.unmount());
  }
});
