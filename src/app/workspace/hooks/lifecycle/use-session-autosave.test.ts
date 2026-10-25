// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { ResumedWorkspace } from "../../../model/app-lifecycle";
import type { WindowTransferPayload } from "../../../model/window-transfer";
import { mountHook } from "../../testing/mount-hook";
import { useImportedSessionMarks } from "./use-session-autosave";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => vi.clearAllMocks());

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
