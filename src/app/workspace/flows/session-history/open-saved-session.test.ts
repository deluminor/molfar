import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createSessionLoader } from "./session-loader";
import {
  openSavedSession,
  type OpenSavedSessionDeps,
} from "./open-saved-session";
import { createSessionPersistence } from "./session-persistence";

function session(id: string): Session {
  return { ...testSession("claude", "/work/demo"), id };
}

function setup(
  options: {
    open?: Session[];
    saved?: Session[];
    removing?: boolean;
    repair?: (session: Session) => Promise<Session>;
  } = {},
) {
  let open = options.open ?? [];
  const opening = new Set<string>();
  const cache = new Map<string, Session>();
  const deps: OpenSavedSessionDeps = {
    openSessions: () => open,
    commitSessions: (next) => {
      open = next;
    },
    loader: createSessionLoader({
      cache,
      opening,
      get: async (id) =>
        options.saved?.find((entry) => entry.id === id) ?? null,
      isRemoving: () => options.removing ?? false,
      isOpen: () => false,
    }),
    repair: options.repair ?? (async (entry) => entry),
    updateSessions: (update) => {
      open = update(open);
    },
    opening,
    cache,
    isRemoving: () => options.removing ?? false,
    persistence: createSessionPersistence({
      upsert: async () => null,
      isBlocked: () => false,
      onSaved: () => {},
    }),
    refreshHistory: vi.fn(),
    bindProvider: vi.fn(),
  };
  return { deps, opening, sessions: () => open };
}

describe("openSavedSession", () => {
  it("returns a session that is already open", async () => {
    const live = session("s1");
    const { deps } = setup({ open: [live] });

    expect(await openSavedSession(deps, "s1")).toBe(live);
    expect(deps.bindProvider).not.toHaveBeenCalled();
  });

  it("loads a saved session into the window and binds its provider", async () => {
    const saved = session("s1");
    const { deps, sessions, opening } = setup({ saved: [saved] });

    const opened = await openSavedSession(deps, "s1");

    expect(opened).toEqual(saved);
    expect(sessions().map((entry) => entry.id)).toEqual(["s1"]);
    expect(deps.bindProvider).toHaveBeenCalledWith(saved);
    expect(opening.has("s1")).toBe(true);
  });

  it("applies the provider log repair after the session is on screen", async () => {
    const saved = session("s1");
    const repairedBlocks = [{ id: "b1", role: "user" as const, text: "repaired" }];
    let finishRepair: (session: Session) => void = () => {};
    const { deps, sessions } = setup({
      saved: [saved],
      repair: () =>
        new Promise((resolve) => {
          finishRepair = resolve;
        }),
    });

    await openSavedSession(deps, "s1");
    expect(sessions()[0]?.blocks).toBe(saved.blocks);

    finishRepair({ ...saved, blocks: repairedBlocks });
    await vi.waitFor(() => expect(sessions()[0]?.blocks).toBe(repairedBlocks));
  });

  it("drops a repair when the transcript advanced while it ran", async () => {
    const saved = session("s1");
    let finishRepair: (session: Session) => void = () => {};
    const { deps, sessions } = setup({
      saved: [saved],
      repair: () =>
        new Promise((resolve) => {
          finishRepair = resolve;
        }),
    });

    await openSavedSession(deps, "s1");
    const advanced = { ...saved, blocks: [{ id: "b2", role: "user" as const, text: "new" }] };
    deps.commitSessions([advanced]);
    finishRepair({ ...saved, blocks: [{ id: "b1", role: "user" as const, text: "repaired" }] });
    await Promise.resolve();
    await Promise.resolve();

    expect(sessions()[0]).toBe(advanced);
  });

  it("re-lists history and gives up when the session is gone", async () => {
    const { deps, sessions, opening } = setup();

    expect(await openSavedSession(deps, "missing")).toBeNull();
    expect(sessions()).toEqual([]);
    expect(opening.has("missing")).toBe(false);
    expect(deps.refreshHistory).toHaveBeenCalledTimes(1);
  });

  it("gives up on a session being removed", async () => {
    const { deps } = setup({ saved: [session("s1")], removing: true });

    expect(await openSavedSession(deps, "s1")).toBeNull();
  });
});
