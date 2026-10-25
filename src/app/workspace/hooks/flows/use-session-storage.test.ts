import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import type { SessionLoaderDeps } from "../../flows/session-history/session-loader";
import type { SessionPersistenceDeps } from "../../flows/session-history/session-persistence";
import type { WorkspaceStore } from "../../store/types";
import { createSessionStorage } from "./use-session-storage";

const captured = vi.hoisted(() => ({
  persistence: undefined as SessionPersistenceDeps | undefined,
  loader: undefined as SessionLoaderDeps | undefined,
}));

vi.mock("../../flows/session-history/session-persistence", () => ({
  createSessionPersistence: (deps: SessionPersistenceDeps) => {
    captured.persistence = deps;
    return { kind: "persistence" };
  },
}));
vi.mock("../../flows/session-history/session-loader", () => ({
  createSessionLoader: (deps: SessionLoaderDeps) => {
    captured.loader = deps;
    return { kind: "loader" };
  },
}));
vi.mock("@/features/sessions/data/session-store", () => ({ readSession: vi.fn(), upsertSession: vi.fn() }));
vi.mock("@/features/sessions/data/session-history", () => ({
  mergeProjectHistorySummary: (current: SessionSummary[], summary: SessionSummary) => [...current, summary],
}));

function build() {
  const setHistory = vi.fn();
  const store = { getState: () => ({ setHistory }) } as unknown as WorkspaceStore;
  const switchingWorktrees = { current: new Map<string, string>() };
  const storage = createSessionStorage({
    store,
    sessionsRef: { current: [{ id: "open" }] as Session[] },
    switchingWorktrees,
    sidebarCwd: () => "/p",
  });
  return { storage, setHistory, switchingWorktrees };
}

describe("createSessionStorage", () => {
  it("blocks writes of chats being removed or moved between worktrees", () => {
    const { storage, switchingWorktrees } = build();
    storage.removingSessionIds.current.add("gone");
    switchingWorktrees.current.set("moving", "/tree");

    expect(["gone", "moving", "kept"].map((id) => captured.persistence?.isBlocked(id))).toEqual([true, true, false]);
  });

  it("merges a saved chat into the history only when it belongs to the sidebar's folder", () => {
    const { setHistory } = build();
    captured.persistence?.onSaved({ id: "x", cwd: "/other" } as SessionSummary);
    captured.persistence?.onSaved({ id: "y", cwd: "/p" } as SessionSummary);

    expect(setHistory).toHaveBeenCalledTimes(1);
    expect(setHistory.mock.calls[0]?.[0]([])).toEqual([{ id: "y", cwd: "/p" }]);
  });

  it("hands the loader the shared cache and opening set, and what is open or being removed", () => {
    const { storage } = build();
    storage.removingSessionIds.current.add("gone");

    expect(captured.loader?.cache).toBe(storage.loadedSessionCache.current);
    expect(captured.loader?.opening).toBe(storage.openingSessionIds.current);
    expect([captured.loader?.isOpen("open"), captured.loader?.isOpen("other")]).toEqual([true, false]);
    expect(captured.loader?.isRemoving("gone")).toBe(true);
    expect(storage.sessionPersistence).toEqual({ kind: "persistence" });
    expect(storage.sessionLoader).toEqual({ kind: "loader" });
  });
});
