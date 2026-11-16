// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import { isBusySession } from "../../model/session-id-sets";
import { createWorkspaceStore } from "../store/create-workspace-store";
import { testWorkspaceState } from "../store/test-state";
import type { WorkspaceStore } from "../store/types";
import { useProviderSignInPrompt } from "./use-provider-sign-in-prompt";
import { useSessionIdSet } from "./use-session-id-set";

const session = (fields: Partial<Session>) =>
  ({ harness: "claude", blocks: [], ...fields }) as unknown as Session;
const signInNeeded = (id: string, turn: string) =>
  session({
    id,
    blocks: [
      { id: turn, role: "user", text: "hi" },
      { id: `${turn}-error`, role: "system", notice: "error", text: "Not logged in" },
    ] as Session["blocks"],
  });

let root: Root;
let store: WorkspaceStore;
const seen = { busy: [] as Set<string>[] };

function Probe({ sessions, active }: { sessions: Session[]; active: Session | undefined }) {
  seen.busy.push(useSessionIdSet(sessions, isBusySession));
  useProviderSignInPrompt(store, sessions, active);
  return null;
}

function render(sessions: Session[], active?: Session): void {
  act(() => root.render(createElement(Probe, { sessions, active })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  store = createWorkspaceStore(testWorkspaceState());
  seen.busy = [];
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("useSessionIdSet", () => {
  it("keeps the set while its contents stay the same", () => {
    render([session({ id: "s1", busy: true })]);
    render([session({ id: "s1", busy: true }), session({ id: "s2" })]);
    render([session({ id: "s2", busy: true })]);

    const [first, same, changed] = seen.busy;
    expect(same).toBe(first);
    expect(changed).not.toBe(first);
    expect([...(changed ?? [])]).toEqual(["s2"]);
  });
});

describe("useProviderSignInPrompt", () => {
  it("prompts once for a new turn that needs sign-in, not for one open at boot", () => {
    const booted = signInNeeded("s1", "u1");
    render([booted], booted);
    expect(store.getState().providerSignInRequest).toBeNull();

    const retried = signInNeeded("s1", "u2");
    render([retried], retried);
    expect(store.getState().providerSignInRequest).toEqual({
      key: "s1:u2",
      sessionId: "s1",
      harness: "claude",
    });

    act(() => store.setState({ providerSignInRequest: null }));
    render([{ ...retried }], { ...retried });
    expect(store.getState().providerSignInRequest).toBeNull();
  });

  it("drops the prompt when another session becomes active", () => {
    const other = session({ id: "s2" });
    render([other], other);
    act(() =>
      store.setState({ providerSignInRequest: { key: "s1:u1", sessionId: "s1", harness: "claude" } }),
    );

    expect(store.getState().providerSignInRequest).toBeNull();
  });
});
