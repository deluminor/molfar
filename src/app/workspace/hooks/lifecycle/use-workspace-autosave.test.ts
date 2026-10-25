// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { mountHook } from "../../testing/mount-hook";
import { useInFlightSnapshot } from "./use-workspace-autosave";

const mocks = vi.hoisted(() => ({ replaceInFlightSessions: vi.fn(async (_refs: unknown) => undefined) }));

vi.mock("@/features/sessions/data/session-store", () => ({
  replaceInFlightSessions: mocks.replaceInFlightSessions,
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
