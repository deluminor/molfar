import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { newTab, type WorkspaceTab } from "@/features/workspace/model/layout";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { createSessionLoader } from "./session-loader";
import { createSessionPersistence } from "./session-persistence";
import {
  applySessionRemovalChange,
  type SessionRemovalChangeDeps,
} from "./session-removal-change";

function session(id: string, extra: Partial<Session> = {}): Session {
  return { ...testSession("claude", "/work/demo"), id, ...extra };
}

function summaryOf(entry: Session): SessionSummary {
  return {
    id: entry.id,
    cwd: entry.cwd,
    harness: entry.harness,
    model: entry.model,
    runtimeMode: entry.runtimeMode,
    title: entry.title,
    orchestrationLeadId: entry.orchestrationLeadId,
    createdAt: 1,
    updatedAt: 1,
  };
}

function setup(open: Session[], tabs: WorkspaceTab[] = []) {
  const store = createWorkspaceStore(
    testWorkspaceState({
      sessions: open,
      tabs,
      activeTabId: tabs[0]?.id ?? "",
    }),
  );
  const cache = new Map<string, Session>();
  const deps: SessionRemovalChangeDeps = {
    store,
    openSessions: () => store.getState().sessions,
    commitSessions: (next) => store.getState().setSessions(next),
    commitTabs: (next) => store.getState().setTabs(next),
    activeTabId: () => store.getState().activeTabId,
    activateTab: vi.fn((id: string) => store.getState().setActiveTabId(id)),
    setComposerFocused: vi.fn(),
    loader: createSessionLoader({
      cache,
      opening: new Set(),
      get: async () => null,
      isRemoving: () => false,
      isOpen: () => false,
    }),
    persistence: createSessionPersistence({
      upsert: async () => null,
      isBlocked: () => false,
      onSaved: () => {},
    }),
    cache,
    refreshHistory: vi.fn(),
  };
  return { deps, store, cache };
}

describe("applySessionRemovalChange", () => {
  it("replaces a stopped session in place", () => {
    const { deps, store } = setup([session("s1"), session("s2")]);
    const stopped = session("s1", { busy: false, title: "stopped" });

    applySessionRemovalChange(
      deps,
      { sessionId: "s1" },
      {
        type: "stopped",
        session: stopped,
      },
    );

    expect(store.getState().sessions.map((entry) => entry.title)).toEqual([
      "stopped",
      "claude",
    ]);
  });

  it("releases a deleted lead's workers everywhere", () => {
    const worker = session("w1", { orchestrationLeadId: "lead" });
    const { deps, store } = setup([worker]);
    store.getState().setHistory([summaryOf(worker)]);
    store.getState().setStoredLinkedSessions([summaryOf(worker)]);

    applySessionRemovalChange(
      deps,
      { sessionId: "lead" },
      {
        type: "orchestrationReleased",
        leadId: "lead",
      },
    );

    expect(store.getState().sessions[0]?.orchestrationLeadId).toBeUndefined();
    expect(store.getState().history[0]?.orchestrationLeadId).toBeUndefined();
    expect(
      store.getState().storedLinkedSessions[0]?.orchestrationLeadId,
    ).toBeUndefined();
  });

  it("drops a deleted session's row and re-lists history", () => {
    const removed = session("s1");
    const blank = session("blank");
    const tab = newTab(blank.id);
    const { deps, store } = setup([removed], [newTab(removed.id)]);
    store.getState().setHistory([summaryOf(removed)]);

    applySessionRemovalChange(
      deps,
      { sessionId: "s1" },
      {
        type: "removed",
        mode: "delete",
        removal: {
          sessions: [blank],
          tabs: [tab],
          activeTabId: tab.id,
          closedTabs: [],
        },
      },
    );

    expect(store.getState().sessions).toEqual([blank]);
    expect(store.getState().tabs).toEqual([tab]);
    expect(deps.activateTab).toHaveBeenCalledWith(tab.id);
    expect(deps.setComposerFocused).toHaveBeenCalledWith(true);
    expect(store.getState().history).toEqual([]);
    expect(deps.refreshHistory).toHaveBeenCalledTimes(1);
  });

  it("lists an archived session as archived and keeps it cached", () => {
    const archived = session("s1", {
      blocks: [{ id: "u", role: "user", text: "hello" }],
    });
    const { deps, store, cache } = setup([archived]);

    applySessionRemovalChange(
      deps,
      { sessionId: "s1" },
      {
        type: "removed",
        mode: "archive",
        session: archived,
        removal: { sessions: [], tabs: [], activeTabId: "", closedTabs: [] },
      },
    );

    expect(store.getState().history).toMatchObject([
      { id: "s1", archived: true },
    ]);
    expect(cache.get("s1")).toBe(archived);
    expect(deps.refreshHistory).not.toHaveBeenCalled();
  });
});
