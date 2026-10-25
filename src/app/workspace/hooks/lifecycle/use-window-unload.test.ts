// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountHook } from "../../testing/mount-hook";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { ResumedWorkspace } from "../../../model/app-lifecycle";
import type { WorkspaceStateRefs } from "./types";
import { useWindowUnload, useWorkspaceTeardown } from "./use-window-unload";

const mocks = vi.hoisted(() => ({
  stopHarnessTextPrompts: vi.fn(async () => undefined),
  stopBridge: vi.fn(),
  startHarnessBridge: vi.fn(),
  bindResumedSessions: vi.fn(),
  quitting: false,
  persistQuitState: vi.fn(async (..._args: unknown[]) => undefined),
  reapWindowRuntime: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("@/integrations/harness", () => ({
  stopHarnessTextPrompts: mocks.stopHarnessTextPrompts,
  startHarnessBridge: mocks.startHarnessBridge,
}));
vi.mock("../../../model/app-lifecycle", () => ({
  bindResumedSessions: mocks.bindResumedSessions,
  isAppQuitting: () => mocks.quitting,
  persistQuitState: mocks.persistQuitState,
  reapWindowRuntime: mocks.reapWindowRuntime,
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  vi.clearAllMocks();
  mocks.quitting = false;
});

describe("useWorkspaceTeardown", () => {
  it("aborts the side questions and stops text prompts only on unmount", () => {
    const btw = { abortAll: vi.fn() };
    const { rerender, unmount } = mountHook(() => useWorkspaceTeardown(btw));
    rerender();
    expect(btw.abortAll).not.toHaveBeenCalled();

    unmount();

    expect(btw.abortAll).toHaveBeenCalledTimes(1);
    expect(mocks.stopHarnessTextPrompts).toHaveBeenCalledTimes(1);
  });
});

describe("useWindowUnload", () => {
  const sessions = [{ id: "a" }] as unknown as Session[];
  const tabs = [{ id: "t" }] as unknown as WorkspaceTab[];
  const refs: WorkspaceStateRefs = {
    sessionsRef: { current: sessions },
    tabsRef: { current: tabs },
    activeTabIdRef: { current: "t" },
    projectCwdRef: { current: "/p" },
    projectTerminalsRef: { current: [] },
    lastDockSideRef: { current: null },
  };
  const memory = new Map([["/p", "a"]]);
  const readMemory = () => memory;

  function setup(resumed: ResumedWorkspace | null = null) {
    mocks.startHarnessBridge.mockReturnValue(mocks.stopBridge);
    const harnessEvents = { dispose: vi.fn() };
    const hook = mountHook(() => useWindowUnload(resumed, readMemory, harnessEvents, refs));
    return { ...hook, harnessEvents };
  }

  it("binds the resumed chats and starts the bridge once", () => {
    const { rerender, unmount } = setup({ sessions } as unknown as ResumedWorkspace);
    rerender();

    expect(mocks.bindResumedSessions.mock.calls).toEqual([[sessions]]);
    expect(mocks.startHarnessBridge).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("saves the latest state on unload, then reaps the window's runtime", async () => {
    const { unmount } = setup();
    window.dispatchEvent(new Event("beforeunload"));
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.persistQuitState.mock.calls).toEqual([
      [sessions, tabs, "t", "/p", memory, "unload", [], undefined],
    ]);
    expect(mocks.reapWindowRuntime.mock.calls).toEqual([[sessions, tabs, []]]);
    unmount();
  });

  it("leaves an unload during a coordinated quit alone", () => {
    mocks.quitting = true;
    const { unmount } = setup();
    window.dispatchEvent(new Event("pagehide"));

    expect(mocks.persistQuitState).not.toHaveBeenCalled();
    unmount();
  });

  it("on unmount stops listening, stops the bridge and disposes the pipeline", () => {
    const { unmount, harnessEvents } = setup();
    unmount();
    window.dispatchEvent(new Event("beforeunload"));

    expect(mocks.persistQuitState).not.toHaveBeenCalled();
    expect(mocks.stopBridge).toHaveBeenCalledTimes(1);
    expect(harnessEvents.dispose).toHaveBeenCalledTimes(1);
  });
});
