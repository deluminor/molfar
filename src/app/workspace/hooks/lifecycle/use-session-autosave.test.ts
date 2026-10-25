// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { ResumedWorkspace } from "../../../model/app-lifecycle";
import type { WindowTransferPayload } from "../../../model/window-transfer";
import { mountHook } from "../../testing/mount-hook";
import {
  useImportedSessionMarks,
  useSessionAutosave,
} from "./use-session-autosave";

const quit = vi.hoisted(() => ({ quitting: false }));

vi.mock("../../../model/app-lifecycle", () => ({ isAppQuitting: () => quit.quitting }));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => {
  vi.clearAllMocks();
  quit.quitting = false;
});

const session = (id: string): Session => ({ id }) as unknown as Session;
const resumedWith = (...ids: string[]): ResumedWorkspace =>
  ({ sessions: ids.map(session) }) as unknown as ResumedWorkspace;
const transferWith = (...ids: string[]): WindowTransferPayload =>
  ({ sessions: ids.map(session) }) as unknown as WindowTransferPayload;

describe("useImportedSessionMarks", () => {
  it("marks the transferred chats over the resumed ones, once", () => {
    const persistence = { markImported: vi.fn() };
    const { rerender } = mountHook(() =>
      useImportedSessionMarks(persistence, transferWith("t"), resumedWith("r")),
    );
    rerender();

    expect(persistence.markImported.mock.calls).toEqual([[session("t")]]);
  });

  it("marks the resumed chats when no window was transferred", () => {
    const persistence = { markImported: vi.fn() };
    mountHook(() => useImportedSessionMarks(persistence, null, resumedWith("a", "b")));

    expect(persistence.markImported.mock.calls).toEqual([[session("a")], [session("b")]]);
  });

  it("marks nothing on a fresh boot", () => {
    const persistence = { markImported: vi.fn() };
    mountHook(() => useImportedSessionMarks(persistence, null, resumedWith()));

    expect(persistence.markImported).not.toHaveBeenCalled();
  });
});

describe("useSessionAutosave", () => {
  function setup(waits: boolean) {
    const listeners: (() => void)[] = [];
    const persistence = { observe: vi.fn(() => waits), writePending: vi.fn(async () => undefined) };
    const sessionState = {
      snapshot: () => [session("a")],
      observe: (listener: () => void) => {
        listeners.push(listener);
        return () => listeners.splice(listeners.indexOf(listener), 1);
      },
    };
    const tabsRef = { current: [{ id: "t", layout: { type: "leaf", id: "a" } }] as unknown as WorkspaceTab[] };
    const hook = mountHook(() => useSessionAutosave(persistence, sessionState, tabsRef));
    return { ...hook, persistence, listeners };
  }

  it("observes at mount and on every change, writing once 650 ms after the last", () => {
    vi.useFakeTimers();
    const { persistence, listeners } = setup(true);
    listeners[0]?.();
    vi.advanceTimersByTime(649);
    listeners[0]?.();
    vi.advanceTimersByTime(649);
    expect(persistence.writePending).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(persistence.observe).toHaveBeenCalledTimes(3);
    expect(persistence.observe.mock.calls[0]).toEqual([[session("a")], new Set(["a"])]);
    expect(persistence.writePending).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("schedules nothing when no chat waits", () => {
    vi.useFakeTimers();
    const { persistence } = setup(false);
    vi.runAllTimers();

    expect(persistence.writePending).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("leaves the pending chats to the quit when the write comes due while quitting", () => {
    vi.useFakeTimers();
    const { persistence } = setup(true);
    quit.quitting = true;
    vi.runAllTimers();

    expect(persistence.writePending).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("writes the pending chats again after a quit is called off", () => {
    vi.useFakeTimers();
    const { persistence, listeners } = setup(true);
    quit.quitting = true;
    vi.runAllTimers();
    quit.quitting = false;
    listeners[0]?.();
    vi.runAllTimers();

    expect(persistence.writePending).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("stops observing and drops the pending write on unmount", () => {
    vi.useFakeTimers();
    const { persistence, listeners, unmount } = setup(true);
    unmount();
    vi.runAllTimers();

    expect(listeners).toHaveLength(0);
    expect(persistence.writePending).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
