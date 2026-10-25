// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { mountHook } from "../../testing/mount-hook";
import type { WindowTransferPayload } from "../../../model/window-transfer";
import {
  useInFlightSnapshot,
  useWorkspaceSnapshotAutosave,
} from "./use-workspace-autosave";

const mocks = vi.hoisted(() => ({
  replaceInFlightSessions: vi.fn(async (_refs: unknown) => undefined),
  saveWorkspaceSnapshot: vi.fn(async (_snapshot: unknown) => undefined),
}));

vi.mock("@/features/sessions/data/session-store", () => ({
  replaceInFlightSessions: mocks.replaceInFlightSessions,
  saveWorkspaceSnapshot: mocks.saveWorkspaceSnapshot,
}));
vi.mock("@/features/projects/model/project-return", () => ({
  reconcileProjectReturn: ({ memory }: { memory: unknown }) => memory,
}));
vi.mock("@/features/workspace/model/workspace-snapshot", () => ({
  collectWorkspaceSnapshot: (tabs: WorkspaceTab[], _sessions: Session[], activeTabId: string, projectCwd: string) => ({
    tabs: tabs.length,
    activeTabId,
    projectCwd,
  }),
  workspaceSnapshotKey: (snapshot: unknown) => JSON.stringify(snapshot),
}));
vi.mock("@/features/sessions/model/in-flight", async (importActual) => ({
  ...(await importActual<typeof import("@/features/sessions/model/in-flight")>()),
  inFlightRefs: (sessions: Session[]) =>
    sessions.filter((session) => session.busy).map((session) => ({ sessionId: session.id, cwd: session.cwd })),
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

afterEach(() => vi.clearAllMocks());

const session = (id: string, busy = false): Session => ({ id, cwd: "/p", busy }) as unknown as Session;
const tabs: WorkspaceTab[] = [];

describe("useInFlightSnapshot", () => {
  it("writes nothing while no turn ever ran", () => {
    let sessions = [session("a")];
    const { rerender } = mountHook(() => useInFlightSnapshot(sessions, tabs));
    sessions = [session("a")];
    rerender();

    expect(mocks.replaceInFlightSessions).not.toHaveBeenCalled();
  });

  it("writes each change of the running set and clears it once after the run", () => {
    let sessions = [session("a", true)];
    const { rerender } = mountHook(() => useInFlightSnapshot(sessions, tabs));
    sessions = [session("a", true)];
    rerender();
    sessions = [session("a", true), session("b", true)];
    rerender();
    sessions = [session("a"), session("b")];
    rerender();
    sessions = [session("a")];
    rerender();

    expect(mocks.replaceInFlightSessions.mock.calls.map(([refs]) => refs)).toEqual([
      [{ sessionId: "a", cwd: "/p" }],
      [
        { sessionId: "a", cwd: "/p" },
        { sessionId: "b", cwd: "/p" },
      ],
      [],
    ]);
  });
});

describe("useWorkspaceSnapshotAutosave", () => {
  const keepAll = () => true;

  function setup(windowTransfer: WindowTransferPayload | null = null) {
    const input = { activeTabId: "t1", worktreePath: undefined as string | undefined };
    const hook = mountHook(() =>
      useWorkspaceSnapshotAutosave({
        tabs,
        sessions: [],
        activeTabId: input.activeTabId,
        projectCwd: "/p",
        projectTerminals: [],
        lastDockSide: null,
        windowTransfer,
        keepWorkspaceTab: keepAll,
        worktreePath: input.worktreePath,
        navigationRevision: 0,
        projectReturnRef: { current: new Map() },
      }),
    );
    return { ...hook, input };
  }

  it("saves the layout 250 ms after it changes, once per distinct layout", () => {
    vi.useFakeTimers();
    const { rerender, input } = setup();
    vi.advanceTimersByTime(250);
    input.activeTabId = "t2";
    rerender();
    vi.advanceTimersByTime(250);
    input.activeTabId = "t1";
    rerender();
    vi.advanceTimersByTime(250);

    expect(mocks.saveWorkspaceSnapshot.mock.calls.map(([snapshot]) => snapshot)).toEqual([
      { tabs: 0, activeTabId: "t1", projectCwd: "/p" },
      { tabs: 0, activeTabId: "t2", projectCwd: "/p" },
      { tabs: 0, activeTabId: "t1", projectCwd: "/p" },
    ]);
    vi.useRealTimers();
  });

  it("drops a pending save when an unchanged layout re-renders within 250 ms (logged bug, kept as is)", () => {
    vi.useFakeTimers();
    const { rerender, input } = setup();
    input.worktreePath = "/p-tree";
    rerender();
    vi.runAllTimers();

    expect(mocks.saveWorkspaceSnapshot).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("never saves from a transferred window", () => {
    vi.useFakeTimers();
    setup({ sessions: [] } as unknown as WindowTransferPayload);
    vi.runAllTimers();

    expect(mocks.saveWorkspaceSnapshot).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
