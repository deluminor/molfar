import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { testSession } from "@/integrations/harness/core/test-session";
import { createWorkspaceStore } from "./create-workspace-store";
import { createWorkspaceSessionState } from "./session-state";
import { testWorkspaceState } from "./test-state";

function session(id: string): Session {
  return { ...testSession("claude", "/work/demo"), id };
}

function setup() {
  const store = createWorkspaceStore(testWorkspaceState({ sessions: [session("a")] }));
  const sessionState = createWorkspaceSessionState(store);
  const shell = vi.fn();
  sessionState.subscribeShell(shell);

  return { store, sessionState, shell };
}

describe("createWorkspaceSessionState", () => {
  it("starts from the workspace store's sessions", () => {
    const { store, sessionState } = setup();

    expect(sessionState.snapshot()).toBe(store.getState().sessions);
  });

  it("mirrors every published snapshot into the workspace store", () => {
    const { store, sessionState, shell } = setup();
    const next = [session("a"), session("b")];

    sessionState.update(next, true);

    expect(store.getState().sessions).toBe(next);
    expect(shell).not.toHaveBeenCalled();
  });

  it("publishes a direct workspace store write as a shell update", () => {
    const { store, sessionState, shell } = setup();
    const pane = vi.fn();
    sessionState.subscribe("a", pane);
    const next = [session("a")];

    store.getState().setSessions(next);

    expect(sessionState.snapshot()).toBe(next);
    expect(sessionState.ref.current).toBe(next);
    expect(shell).toHaveBeenCalledTimes(1);
    expect(pane).toHaveBeenCalledTimes(1);
  });

  it("ignores workspace store writes that leave the sessions alone", () => {
    const { store, shell } = setup();

    store.getState().setSearchViewOpen(true);

    expect(shell).not.toHaveBeenCalled();
  });
});
