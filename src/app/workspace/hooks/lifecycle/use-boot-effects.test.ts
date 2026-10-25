// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceStore } from "../../store/types";
import { mountHook } from "../../testing/mount-hook";
import type { WindowTransferPayload } from "../../../model/window-transfer";
import { useDefaultProject, useReopenFamiliar } from "./use-boot-effects";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(async (_command: string) => "/home/me"),
  lastProjectPath: vi.fn((): string | null => null),
  looksLikeProject: vi.fn((_cwd: string) => true),
  loadOpenFamiliar: vi.fn((): string | undefined => "f1"),
  findFamiliar: vi.fn((id: string) => (id === "f1" ? { id } : undefined)),
  saveOpenFamiliar: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/features/projects/model/recents", () => ({
  lastProjectPath: mocks.lastProjectPath,
  looksLikeProject: mocks.looksLikeProject,
  rememberProject: (cwd: string) => [{ path: cwd }],
}));

vi.mock("@/features/familiars/model/familiar", () => ({
  loadOpenFamiliar: mocks.loadOpenFamiliar,
  findFamiliar: mocks.findFamiliar,
  saveOpenFamiliar: mocks.saveOpenFamiliar,
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => vi.clearAllMocks());

const session = (id: string, cwd: string): Session => ({ id, cwd }) as unknown as Session;

function setup() {
  const setProjectCwd = vi.fn();
  const setRecents = vi.fn();
  const setSessions = vi.fn();
  const store = { getState: () => ({ setProjectCwd, setRecents }) } as unknown as WorkspaceStore;
  return { store, setProjectCwd, setRecents, setSessions };
}

describe("useDefaultProject", () => {
  it("opens the home folder once and moves blank chats there", async () => {
    const { store, setProjectCwd, setRecents, setSessions } = setup();
    const { rerender } = mountHook(() => useDefaultProject(store, setSessions));
    rerender();
    await act(async () => undefined);

    expect(mocks.invoke.mock.calls).toEqual([["default_cwd"]]);
    expect(setProjectCwd).toHaveBeenCalledWith("/home/me");
    expect(setRecents.mock.calls[0]?.[0]([])).toEqual([{ path: "/home/me" }]);
    expect(setRecents.mock.calls[0]?.[0]([{ path: "/kept" }])).toEqual([{ path: "/kept" }]);
    expect(setSessions.mock.calls[0]?.[0]([session("a", "~"), session("b", "/x")])).toEqual([
      session("a", "/home/me"),
      session("b", "/x"),
    ]);
  });

  it("keeps the last project", async () => {
    mocks.lastProjectPath.mockReturnValueOnce("/last");
    const { store, setSessions } = setup();
    mountHook(() => useDefaultProject(store, setSessions));
    await act(async () => undefined);

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("ignores a home folder that is not a project", async () => {
    mocks.looksLikeProject.mockReturnValueOnce(false);
    const { store, setProjectCwd, setSessions } = setup();
    mountHook(() => useDefaultProject(store, setSessions));
    await act(async () => undefined);

    expect(setProjectCwd).not.toHaveBeenCalled();
    expect(setSessions).not.toHaveBeenCalled();
  });
});

describe("useReopenFamiliar", () => {
  it("reopens the Familiar open at last close, once", () => {
    const open = vi.fn();
    let enabled = true;
    const { rerender } = mountHook(() => useReopenFamiliar(enabled, open, null));
    enabled = false;
    rerender();
    enabled = true;
    rerender();

    expect(open.mock.calls).toEqual([["f1"]]);
  });

  it("forgets a saved Familiar that no longer exists", () => {
    mocks.loadOpenFamiliar.mockReturnValueOnce("gone");
    const open = vi.fn();
    mountHook(() => useReopenFamiliar(true, open, null));

    expect(open).not.toHaveBeenCalled();
    expect(mocks.saveOpenFamiliar).toHaveBeenCalledWith(undefined);
  });

  it("skips a transferred window and disabled Familiars for good", () => {
    const open = vi.fn();
    let enabled = false;
    const { rerender } = mountHook(() => useReopenFamiliar(enabled, open, null));
    enabled = true;
    rerender();
    mountHook(() => useReopenFamiliar(true, open, { sessions: [] } as unknown as WindowTransferPayload));

    expect(open).not.toHaveBeenCalled();
    expect(mocks.loadOpenFamiliar).not.toHaveBeenCalled();
  });
});
