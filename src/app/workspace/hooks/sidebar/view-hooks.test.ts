// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { useLiveAgentsView } from "./use-live-agents-view";
import { useSidebarHistoryView } from "./use-sidebar-history-view";

const mocks = vi.hoisted(() => ({
  familiars: [] as Array<{ sessionId?: string }>,
  liveAgents: vi.fn(),
  merge: vi.fn(),
}));

vi.mock("@/features/familiars/model/familiar", () => ({ listFamiliars: () => mocks.familiars }));
vi.mock("@/features/sessions/model/live-agents", () => ({ liveAgentsFromSessions: mocks.liveAgents }));
vi.mock("@/features/sessions/data/session-history", () => ({
  historyWithLiveSessions: mocks.merge,
  sameSessionSummaries: (a: SessionSummary[], b: SessionSummary[]) =>
    a.length === b.length && a.every((row, index) => row.id === b[index].id),
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

function mount<T>(hook: () => T) {
  const results: T[] = [];
  function Probe() {
    results.push(hook());
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return { results, rerender: () => act(() => root.render(createElement(Probe))) };
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.familiars = [];
});

describe("useLiveAgentsView", () => {
  it("leaves out Familiars and dismissed finished cards and keeps identity for equal rows", () => {
    mocks.familiars = [{ sessionId: "fam" }, {}];
    mocks.liveAgents.mockImplementation(() => [
      { id: "a", done: true },
      { id: "b", done: true },
      { id: "c", done: false },
    ]);
    let sessions: Session[] = [];
    const view = mount(() =>
      useLiveAgentsView({
        liveAgentsEnabled: true,
        promptableSessions: sessions,
        unseenFinishedIds: new Set(),
        familiarsSnap: 1,
        dismissedLiveAgentIds: new Set(["a", "c"]),
      }),
    );
    sessions = [];
    view.rerender();

    expect(mocks.liveAgents.mock.calls[0][2]).toEqual(new Set(["fam"]));
    expect(view.results[0].map((agent) => agent.id)).toEqual(["b", "c"]);
    expect(view.results[1]).toBe(view.results[0]);
  });

  it("is empty while live agents are off", () => {
    const view = mount(() =>
      useLiveAgentsView({
        liveAgentsEnabled: false,
        promptableSessions: [],
        unseenFinishedIds: new Set(),
        familiarsSnap: 1,
        dismissedLiveAgentIds: new Set(),
      }),
    );

    expect(view.results[0]).toEqual([]);
    expect(mocks.liveAgents).not.toHaveBeenCalled();
  });
});

describe("useSidebarHistoryView", () => {
  it("slices the project's history and merges live chats with the branch hint", () => {
    const history = [
      { id: "1", cwd: "/a" },
      { id: "2", cwd: "/b" },
    ] as SessionSummary[];
    mocks.merge.mockImplementation(() => [{ id: "1" }]);
    const view = mount(() =>
      useSidebarHistoryView({
        history,
        promptableSessions: [],
        sidebarCwd: "/a",
        projectBranches: { current: "main" } as never,
        orchestrationRuns: [],
      }),
    );
    view.rerender();

    expect(view.results[0].projectHistory.map((entry) => entry.id)).toEqual(["1"]);
    expect(mocks.merge).toHaveBeenCalledWith(history, [], "/a", { branch: "main", repo: "a" }, []);
    expect(view.results[0].sidebarHistory).toEqual([{ id: "1" }]);
  });
});
