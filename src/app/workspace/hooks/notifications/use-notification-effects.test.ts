// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { useDockBadge, useNotificationPermissionProbe } from "./use-notification-effects";

const mocks = vi.hoisted(() => ({
  enabled: true,
  probe: vi.fn(async () => undefined),
  syncDockBadge: vi.fn(),
}));

vi.mock("@/features/notifications/model/notifications", () => ({
  loadNotificationsEnabled: () => mocks.enabled,
  probeNotificationPermission: mocks.probe,
}));
vi.mock("@/features/notifications/model/dock-badge", () => ({ syncDockBadge: mocks.syncDockBadge }));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

function mount(hook: () => void) {
  function Probe() {
    hook();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return () => act(() => root.render(createElement(Probe)));
}

afterEach(() => vi.clearAllMocks());

describe("useNotificationPermissionProbe", () => {
  it("probes once when notifications are on", () => {
    mocks.enabled = true;
    const rerender = mount(() => useNotificationPermissionProbe());
    rerender();
    expect(mocks.probe).toHaveBeenCalledTimes(1);
  });

  it("skips the probe when notifications are off", () => {
    mocks.enabled = false;
    mount(() => useNotificationPermissionProbe());
    expect(mocks.probe).not.toHaveBeenCalled();
  });
});

describe("useDockBadge", () => {
  it("syncs the badge on each sessions change", () => {
    let sessions: Session[] = [];
    const rerender = mount(() => useDockBadge(sessions));
    rerender();
    sessions = [{ id: "a" } as Session];
    rerender();
    expect(mocks.syncDockBadge.mock.calls).toEqual([[[]], [sessions]]);
  });
});
