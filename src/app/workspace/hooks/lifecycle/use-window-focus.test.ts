// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { mountHook } from "../../testing/mount-hook";
import { useVisibilityFlush, useWindowFocus } from "./use-window-focus";

type FocusHandler = (event: { payload: boolean }) => void;

const mocks = vi.hoisted(() => ({
  onFocus: undefined as FocusHandler | undefined,
  unlisten: vi.fn(),
  setWindowFocused: vi.fn(),
  syncDockBadge: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: async (handler: FocusHandler) => {
      mocks.onFocus = handler;
      return mocks.unlisten;
    },
  }),
}));
vi.mock("@/features/notifications/model/notifications", () => ({ setWindowFocused: mocks.setWindowFocused }));
vi.mock("@/features/notifications/model/dock-badge", () => ({ syncDockBadge: mocks.syncDockBadge }));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => vi.clearAllMocks());

async function setup(covered: { search?: boolean; terminal?: boolean } = {}) {
  const input = {
    flushForegroundHarnessEvents: vi.fn(),
    sessionsRef: { current: [{ id: "a" }] as unknown as Session[] },
    projectTerminalFocusedRef: { current: !!covered.terminal },
    searchViewOpenRef: { current: !!covered.search },
    inboxViewOpenRef: { current: false },
    notesViewOpenRef: { current: false },
    automationsViewOpenRef: { current: false },
    settingsOpenRef: { current: false },
    setComposerFocused: vi.fn(),
    setComposerFocusToken: vi.fn(),
  };
  const hook = mountHook(() => useWindowFocus(input));
  await act(async () => undefined);
  return { ...hook, input };
}

describe("useWindowFocus", () => {
  it("on focus flushes, syncs the badge and gives the composer focus back", async () => {
    const { input } = await setup();
    mocks.onFocus?.({ payload: true });

    expect(mocks.setWindowFocused).toHaveBeenCalledWith(true);
    expect(input.flushForegroundHarnessEvents).toHaveBeenCalledTimes(1);
    expect(mocks.syncDockBadge).toHaveBeenCalledWith(input.sessionsRef.current);
    expect(input.setComposerFocused).toHaveBeenCalledWith(true);
    expect(input.setComposerFocusToken.mock.calls[0]?.[0](1)).toBe(2);
  });

  it("leaves focus alone while a view or the terminal holds it", async () => {
    const search = await setup({ search: true });
    mocks.onFocus?.({ payload: true });
    const terminal = await setup({ terminal: true });
    mocks.onFocus?.({ payload: true });

    expect(search.input.setComposerFocused).not.toHaveBeenCalled();
    expect(terminal.input.setComposerFocused).not.toHaveBeenCalled();
    expect(terminal.input.flushForegroundHarnessEvents).toHaveBeenCalledTimes(1);
  });

  it("only records a blur, and unlistens on unmount", async () => {
    const { input, unmount } = await setup();
    mocks.onFocus?.({ payload: false });
    unmount();

    expect(mocks.setWindowFocused).toHaveBeenCalledWith(false);
    expect(input.flushForegroundHarnessEvents).not.toHaveBeenCalled();
    expect(mocks.unlisten).toHaveBeenCalledTimes(1);
  });
});

describe("useVisibilityFlush", () => {
  it("flushes on every visibility change until unmount", () => {
    const flush = vi.fn();
    const { unmount } = mountHook(() => useVisibilityFlush(flush));
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
    unmount();
    document.dispatchEvent(new Event("visibilitychange"));

    expect(flush).toHaveBeenCalledTimes(2);
  });
});
