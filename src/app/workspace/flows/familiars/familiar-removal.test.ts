import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { deleteFamiliar, resetFamiliar, type FamiliarRemovalDeps } from "./familiar-removal";

const familiar = vi.hoisted(() => ({
  find: vi.fn(),
  remove: vi.fn(),
  isFamiliarSession: vi.fn(),
  confirm: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("@/features/familiars/model/familiar", () => ({
  findFamiliar: familiar.find,
  familiarLook: () => ({ name: "Scout" }),
  isFamiliarSession: familiar.isFamiliarSession,
  removeFamiliar: familiar.remove,
}));
vi.mock("@/features/familiars/model/familiar-workspace", () => ({ resetFamiliarSession: familiar.reset }));
vi.mock("@/shared/lib/app-dialog", () => ({ confirmApp: familiar.confirm }));

function setup(sessions: Session[] = [{ ...testSession("claude", "/work/demo"), id: "chat" }]) {
  const store = createWorkspaceStore(testWorkspaceState({ sessions }));
  const deps = {
    store,
    sessionsRef: { current: sessions },
    removingSessionIds: { current: new Set<string>() },
    persistence: { dropPending: vi.fn(), forget: vi.fn() },
    view: { close: vi.fn(), forget: vi.fn(), replaceSession: vi.fn() },
    commitSessions: vi.fn(),
    invalidateLoadedSession: vi.fn(),
    stopSessionForRemoval: vi.fn(async () => undefined),
    flushCheckpoint: vi.fn(async () => undefined),
    deleteStoredSession: vi.fn(async () => undefined),
    removeSession: vi.fn(async () => true),
  } satisfies FamiliarRemovalDeps;
  return { deps, store };
}

beforeEach(() => {
  vi.clearAllMocks();
  familiar.find.mockReturnValue({ id: "f1", sessionId: "chat" });
  familiar.isFamiliarSession.mockReturnValue(true);
  familiar.confirm.mockResolvedValue(true);
});

describe("deleteFamiliar", () => {
  it("does nothing when the user declines", async () => {
    const { deps } = setup();
    familiar.confirm.mockResolvedValue(false);

    await deleteFamiliar(deps, "f1");

    expect(deps.removeSession).not.toHaveBeenCalled();
    expect(familiar.remove).not.toHaveBeenCalled();
  });

  it("deletes the conversation without asking again, then the Familiar", async () => {
    const { deps } = setup();

    await deleteFamiliar(deps, "f1");

    expect(deps.removeSession).toHaveBeenCalledWith("chat", "delete", true);
    expect(familiar.remove).toHaveBeenCalledWith("f1");
    expect(deps.view.forget).toHaveBeenCalledWith("f1");
  });

  it("keeps the Familiar when its conversation could not be deleted", async () => {
    const { deps } = setup();
    deps.removeSession.mockResolvedValue(false);

    await deleteFamiliar(deps, "f1");

    expect(familiar.remove).not.toHaveBeenCalled();
  });

  it("skips session removal when the conversation is gone already", async () => {
    const { deps } = setup([]);

    await deleteFamiliar(deps, "f1");

    expect(deps.removeSession).not.toHaveBeenCalled();
    expect(familiar.remove).toHaveBeenCalledWith("f1");
  });

  it("closes the Familiar view when it shows the conversation", async () => {
    const { deps, store } = setup();
    store.getState().setFamiliarViewId("chat");

    await deleteFamiliar(deps, "f1");

    expect(deps.view.close).toHaveBeenCalled();
  });
});

describe("resetFamiliar", () => {
  it("rejects a conversation that is not a Familiar's", async () => {
    const { deps } = setup();
    familiar.isFamiliarSession.mockReturnValue(false);

    await expect(resetFamiliar(deps, "chat")).rejects.toThrow("no longer available");
  });

  it("rejects a reset already in flight", async () => {
    const { deps } = setup();
    deps.removingSessionIds.current.add("chat");

    await expect(resetFamiliar(deps, "chat")).rejects.toThrow("already being reset");
  });

  it("drops pending writes and releases the lock afterwards", async () => {
    const { deps } = setup();
    familiar.reset.mockRejectedValue(new Error("boom"));

    await expect(resetFamiliar(deps, "chat")).rejects.toThrow("boom");

    expect(deps.persistence.dropPending).toHaveBeenCalledWith("chat");
    expect(deps.removingSessionIds.current.size).toBe(0);
  });

  it("swaps the fresh conversation in and forgets the old rows", async () => {
    const { deps, store } = setup();
    const fresh = { ...testSession("claude", "/work/demo"), id: "fresh" };
    familiar.reset.mockImplementation(async (_current, host) => host.replace(fresh));

    await resetFamiliar(deps, "chat");

    expect(deps.commitSessions).toHaveBeenCalledWith([fresh]);
    expect(deps.persistence.forget).toHaveBeenCalledWith("chat");
    expect(deps.view.replaceSession).toHaveBeenCalledWith("chat", "fresh");
    expect(store.getState().history).toEqual([]);
  });
});
