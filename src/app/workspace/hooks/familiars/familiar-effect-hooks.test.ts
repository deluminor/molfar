// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ARTIFACT_DELETED_EVENT } from "@/features/artifacts/artifacts";
import type { Session } from "@/domain/session/session";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { useFamiliarOverviewSync } from "./use-familiar-overview-sync";
import { useFamiliarTabMigration } from "./use-familiar-tab-migration";
import { useFamiliarTurnClose } from "./use-familiar-turn-close";

const events = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: string }) => void>(),
  unlisten: vi.fn(),
}));
const migration = vi.hoisted(() => ({ detach: vi.fn() }));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: string }) => void) => {
    events.handlers.set(name, handler);
    return events.unlisten;
  }),
}));
vi.mock("@/features/familiars/model/familiar-workspace", () => ({
  detachFamiliarTabs: migration.detach,
}));

const session = (id: string, cards: string[] = []): Session =>
  ({
    id,
    blocks: [{ id: `${id}-b`, artifactCards: cards.map((card) => ({ id: card })) }],
  }) as unknown as Session;

function mount(hook: () => void) {
  function Probe() {
    hook();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return root;
}

afterEach(() => {
  events.handlers.clear();
  vi.clearAllMocks();
});

describe("useFamiliarOverviewSync", () => {
  it("drops a deleted artifact from chats and the overview until unmounted", async () => {
    const store = createWorkspaceStore(testWorkspaceState({ familiarOverviewDocument: "doc" }));
    const untouched = session("b");
    const sessionsRef = { current: [session("a", ["doc"]), untouched] };
    const setSessions = vi.fn();
    const root = mount(() => useFamiliarOverviewSync(store, sessionsRef, setSessions));

    act(() => events.handlers.get(ARTIFACT_DELETED_EVENT)?.({ payload: "doc" }));

    expect(sessionsRef.current[0].blocks[0].artifactCards ?? []).toEqual([]);
    expect(sessionsRef.current[1]).toBe(untouched);
    expect(setSessions).toHaveBeenCalledWith(sessionsRef.current);
    expect(store.getState().familiarOverviewDocument).toBeNull();

    act(() => root.unmount());
    await Promise.resolve();
    expect(events.unlisten).toHaveBeenCalledTimes(1);
  });

  it("leaves the shown session and document when the overview hides", () => {
    const store = createWorkspaceStore(
      testWorkspaceState({ familiarShownSession: "s", familiarOverviewDocument: "doc" }),
    );
    mount(() => useFamiliarOverviewSync(store, { current: [] }, vi.fn()));
    expect(store.getState().familiarShownSession).toBe("s");

    act(() => store.getState().setFamiliarOverviewOpen(false));

    expect(store.getState().familiarShownSession).toBeNull();
    expect(store.getState().familiarOverviewDocument).toBeNull();
  });
});

describe("useFamiliarTabMigration", () => {
  it("moves Familiars out of tabs and keeps the shown one in view", () => {
    const store = createWorkspaceStore(testWorkspaceState());
    const tab = { id: "t2" } as WorkspaceTab;
    const added = session("blank");
    migration.detach.mockReturnValue({
      tabs: [tab],
      addedSessions: [added],
      activeTabId: "t2",
      agentViewId: "familiar-session",
    });
    const tabsRef = { current: [] as WorkspaceTab[] };
    const sessionsRef = { current: [] as Session[] };
    const setSessions = vi.fn();

    mount(() =>
      useFamiliarTabMigration({
        store,
        tabs: [],
        sessions: [],
        activeTabId: "t1",
        projectCwd: "/p",
        tabsRef,
        sessionsRef,
        setSessions,
      }),
    );

    expect(migration.detach).toHaveBeenCalledWith([], [], "t1", "/p", expect.any(Function));
    expect(tabsRef.current).toEqual([tab]);
    expect(sessionsRef.current).toEqual([added]);
    expect(setSessions).toHaveBeenCalledWith([added]);
    expect(store.getState().tabs).toEqual([tab]);
    expect(store.getState().activeTabId).toBe("t2");
    expect(store.getState().familiarViewId).toBe("familiar-session");
  });

  it("writes nothing when no tab holds a Familiar", () => {
    const store = createWorkspaceStore(testWorkspaceState({ activeTabId: "t1" }));
    migration.detach.mockReturnValue(null);
    const setSessions = vi.fn();

    mount(() =>
      useFamiliarTabMigration({
        store,
        tabs: [],
        sessions: [],
        activeTabId: "t1",
        projectCwd: "/p",
        tabsRef: { current: [] },
        sessionsRef: { current: [] },
        setSessions,
      }),
    );

    expect(setSessions).not.toHaveBeenCalled();
    expect(store.getState().activeTabId).toBe("t1");
  });
});

describe("useFamiliarTurnClose", () => {
  it("closes inactive Familiar turns on every sessions change", () => {
    const closeInactive = vi.fn();
    const completions = { closeInactive } as unknown as Parameters<typeof useFamiliarTurnClose>[0];
    let sessions: Session[] = [];
    function Probe() {
      useFamiliarTurnClose(completions, sessions);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Probe)));
    act(() => root.render(createElement(Probe)));
    expect(closeInactive).toHaveBeenCalledTimes(1);

    sessions = [session("a")];
    act(() => root.render(createElement(Probe)));
    expect(closeInactive).toHaveBeenCalledTimes(2);
  });
});
