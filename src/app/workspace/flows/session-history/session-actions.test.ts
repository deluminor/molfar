import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import {
  pinSession,
  renameSession,
  type SessionActionsDeps,
} from "./session-actions";
import { createSessionLoader } from "./session-loader";
import { createSessionPersistence } from "./session-persistence";

function project(id: string, title = "claude"): Session {
  return {
    ...testSession("claude", "/work/demo"),
    id,
    title,
    blocks: [{ id: `${id}-u`, role: "user", text: "hello" }],
  };
}

function summaryOf(session: Session): SessionSummary {
  return {
    id: session.id,
    cwd: session.cwd,
    harness: session.harness,
    model: session.model,
    runtimeMode: session.runtimeMode,
    title: session.title,
    createdAt: 1,
    updatedAt: 1,
  };
}

function setup(options: { open?: Session[]; saved?: Session[] } = {}) {
  const store = createWorkspaceStore(
    testWorkspaceState({ sessions: options.open ?? [] }),
  );
  const cache = new Map<string, Session>();
  const upserted: Session[] = [];
  const upsertSession = vi.fn(async (session: Session) => {
    upserted.push(session);
    return summaryOf(session);
  });
  const refreshHistory = vi.fn();
  const deps: SessionActionsDeps = {
    store,
    openSessions: () => store.getState().sessions,
    loader: createSessionLoader({
      cache,
      opening: new Set(),
      get: async () => null,
      isRemoving: () => false,
      isOpen: () => false,
    }),
    persistence: createSessionPersistence({
      upsert: upsertSession,
      isBlocked: () => false,
      onSaved: () => {},
    }),
    cache,
    refreshHistory,
    getSession: async (id) =>
      options.saved?.find((session) => session.id === id) ?? null,
    upsertSession,
    setSessionPinned: vi.fn(async () => {}),
  };
  return { deps, store, cache, upserted, refreshHistory };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("renameSession", () => {
  it("renames an open session in place and saves it", async () => {
    const { deps, store, upserted, refreshHistory } = setup({
      open: [project("s1")],
    });

    await renameSession(deps, "s1", "  Upload retries  ");
    await flush();

    expect(store.getState().sessions[0]?.title).toBe("claude · Upload retries");
    expect(upserted.map((session) => session.title)).toEqual([
      "claude · Upload retries",
    ]);
    expect(refreshHistory).toHaveBeenCalledTimes(1);
  });

  it("renames a saved session and keeps it cached as written", async () => {
    const { deps, cache, upserted } = setup({ saved: [project("s1")] });

    await renameSession(deps, "s1", "Upload retries");

    expect(upserted[0]?.title).toBe("claude · Upload retries");
    expect(cache.get("s1")?.title).toBe("claude · Upload retries");
  });

  it("ignores a blank title", async () => {
    const { deps, upserted, refreshHistory } = setup({ open: [project("s1")] });

    await renameSession(deps, "s1", "   ");

    expect(upserted).toEqual([]);
    expect(refreshHistory).not.toHaveBeenCalled();
  });

  it("re-lists history when the saved session is gone", async () => {
    const { deps, upserted, refreshHistory } = setup();

    await renameSession(deps, "missing", "Upload retries");

    expect(upserted).toEqual([]);
    expect(refreshHistory).toHaveBeenCalledTimes(1);
  });
});

describe("pinSession", () => {
  it("pins a listed row in history", async () => {
    const listed = summaryOf(project("s1"));
    const { deps, store } = setup();
    store.getState().setHistory([listed]);

    await pinSession(deps, "s1", true);

    expect(deps.setSessionPinned).toHaveBeenCalledWith("s1", true);
    expect(store.getState().history[0]?.pinned).toBe(true);
  });

  it("saves an open, unlisted session first and lists it pinned", async () => {
    const { deps, store, upserted } = setup({ open: [project("s1")] });

    await pinSession(deps, "s1", true);

    expect(upserted.map((session) => session.id)).toEqual(["s1"]);
    expect(store.getState().history).toMatchObject([
      { id: "s1", pinned: true },
    ]);
  });

  it("leaves history alone for an unknown session", async () => {
    const { deps, store } = setup();

    await pinSession(deps, "missing", true);

    expect(store.getState().history).toEqual([]);
  });
});
