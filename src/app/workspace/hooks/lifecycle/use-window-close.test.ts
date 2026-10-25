// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { mountHook } from "../../testing/mount-hook";
import type { WorkspaceStateRefs } from "./types";
import { useWindowClose } from "./use-window-close";

type CloseHandler = (event: { preventDefault(): void }) => Promise<void>;

const mocks = vi.hoisted(() => ({
  mac: false,
  keepAlive: false,
  toTray: true,
  busy: false,
  onClose: undefined as CloseHandler | undefined,
  unlisten: vi.fn(),
  releaseQuit: vi.fn(),
  setQuitWorkspace: vi.fn((..._getters: unknown[]) => mocks.releaseQuit),
  persistQuitState: vi.fn(async (..._args: unknown[]) => undefined),
  persistLiveTranscripts: vi.fn(async (_sessions: unknown) => undefined),
  hideCurrentWindow: vi.fn(async () => undefined),
  closeCurrentWindow: vi.fn(async () => undefined),
  closeBusyWindow: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: async () => mocks.keepAlive }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (handler: CloseHandler) => {
      mocks.onClose = handler;
      return mocks.unlisten;
    },
  }),
}));
vi.mock("@/shared/lib/platform", () => ({
  get IS_MAC() {
    return mocks.mac;
  },
}));
vi.mock("@/features/settings/model/settings", () => ({ loadCloseToTray: () => mocks.toTray }));
vi.mock("../../../model/app-lifecycle", () => ({
  setQuitWorkspace: mocks.setQuitWorkspace,
  persistQuitState: mocks.persistQuitState,
  persistLiveTranscripts: mocks.persistLiveTranscripts,
  hideCurrentWindow: mocks.hideCurrentWindow,
  closeCurrentWindow: mocks.closeCurrentWindow,
  closeBusyWindow: mocks.closeBusyWindow,
  hasInFlightSessions: () => mocks.busy,
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks, { mac: false, keepAlive: false, toTray: true, busy: false, onClose: undefined });
});

const sessions = [{ id: "a" }] as unknown as Session[];
const tabs = [{ id: "t" }] as unknown as WorkspaceTab[];
const refs: WorkspaceStateRefs = {
  sessionsRef: { current: sessions },
  tabsRef: { current: tabs },
  activeTabIdRef: { current: "t" },
  projectCwdRef: { current: "/p" },
  projectTerminalsRef: { current: [] },
  lastDockSideRef: { current: "left" },
};
const memory = new Map([["/p", "a"]]);
const readMemory = () => memory;
const flush = vi.fn();
const keepTab = () => true;

async function close() {
  const hook = mountHook(() => useWindowClose(readMemory, flush, keepTab, refs));
  await act(async () => undefined);
  const event = { preventDefault: vi.fn() };
  await act(async () => mocks.onClose?.(event));
  return { ...hook, event };
}

describe("useWindowClose", () => {
  it("hands the coordinated quit getters over the latest state", async () => {
    await close();
    const [getSessions, getTabs, getActive, getProject, getTerminals, read, flushEvents, getDockSide, keep] =
      mocks.setQuitWorkspace.mock.calls[0] ?? [];

    expect([getSessions, getTabs, getActive, getProject, getTerminals, getDockSide].map((get) => (get as () => unknown)())).toEqual([
      sessions,
      tabs,
      "t",
      "/p",
      [],
      "left",
    ]);
    expect([read, flushEvents, keep]).toEqual([readMemory, flush, keepTab]);
  });

  it("saves an idle window's chats and layout, then hides it to the tray", async () => {
    const { event } = await close();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(mocks.persistQuitState.mock.calls).toEqual([
      [sessions, tabs, "t", "/p", memory, "unload", [], "left", keepTab],
    ]);
    expect(mocks.hideCurrentWindow).toHaveBeenCalledTimes(1);
    expect(mocks.closeCurrentWindow).not.toHaveBeenCalled();
  });

  it("closes an idle window when close to tray is off", async () => {
    mocks.toTray = false;
    await close();

    expect(mocks.closeCurrentWindow).toHaveBeenCalledTimes(1);
    expect(mocks.hideCurrentWindow).not.toHaveBeenCalled();
  });

  it("asks before closing a busy window with close to tray off", async () => {
    Object.assign(mocks, { busy: true, toTray: false });
    await close();

    expect(flush).toHaveBeenCalled();
    expect(mocks.closeBusyWindow).toHaveBeenCalledTimes(1);
    expect(mocks.persistLiveTranscripts).not.toHaveBeenCalled();
  });

  it("hides a busy window with its transcripts saved, on macOS even with close to tray off", async () => {
    Object.assign(mocks, { busy: true, toTray: false, mac: true });
    await close();

    expect(mocks.persistLiveTranscripts.mock.calls).toEqual([[sessions]]);
    expect(mocks.hideCurrentWindow).toHaveBeenCalledTimes(1);
    expect(mocks.persistQuitState).not.toHaveBeenCalled();
  });

  it("only hides on macOS while a Familiar chat stays alive", async () => {
    Object.assign(mocks, { mac: true, keepAlive: true });
    await close();

    expect(mocks.persistLiveTranscripts.mock.calls).toEqual([[sessions]]);
    expect(mocks.hideCurrentWindow).toHaveBeenCalledTimes(1);
    expect(mocks.persistQuitState).not.toHaveBeenCalled();
  });

  it("releases the quit getters and the close listener on unmount", async () => {
    const { unmount } = await close();
    unmount();

    expect(mocks.releaseQuit).toHaveBeenCalledTimes(1);
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
  });
});
