// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/features/sessions/data/session-store";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceState } from "../../store/types";
import { useInboxAskFocus, useInboxLinkedSessions, useLinkedPanelPrune } from "./use-inbox-effects";

const mocks = vi.hoisted(() => ({ listLinkedSessions: vi.fn() }));

vi.mock("@/features/sessions/data/session-store", () => ({
  listLinkedSessions: mocks.listLinkedSessions,
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

function mount(hook: () => void) {
  function Probe() {
    hook();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return { root, rerender: () => act(() => root.render(createElement(Probe))) };
}

const tab = (id: string, leaf: string) =>
  ({ id, layout: { type: "leaf", id: leaf } }) as unknown as WorkspaceTab;
type Panels = WorkspaceState["linkedWorkItemPanels"];
const panel = (sessionId: string) => ({ sessionId }) as unknown as Panels extends Map<string, infer P> ? P : never;

afterEach(() => vi.clearAllMocks());

describe("useLinkedPanelPrune", () => {
  it("drops the panels of chats no tab shows and keeps the map otherwise", () => {
    const panels: Panels = new Map([
      ["a", panel("a")],
      ["b", panel("b")],
    ]);
    const store = createWorkspaceStore(testWorkspaceState({ linkedWorkItemPanels: panels }));
    let tabs = [tab("t1", "a"), tab("t2", "b")];
    const { rerender } = mount(() => useLinkedPanelPrune(store, tabs));
    expect(store.getState().linkedWorkItemPanels).toBe(panels);

    tabs = [tab("t1", "a")];
    rerender();
    expect([...store.getState().linkedWorkItemPanels.keys()]).toEqual(["a"]);
  });
});

describe("useInboxLinkedSessions", () => {
  it("loads the linked chats when the Inbox opens", async () => {
    const rows = [{ id: "s" }] as SessionSummary[];
    mocks.listLinkedSessions.mockResolvedValue(rows);
    const store = createWorkspaceStore(testWorkspaceState());
    let open = false;
    const { rerender } = mount(() => useInboxLinkedSessions(store, open));
    expect(mocks.listLinkedSessions).not.toHaveBeenCalled();

    open = true;
    rerender();
    await act(async () => {});
    expect(store.getState().storedLinkedSessions).toBe(rows);
  });

  it("drops a late answer after the Inbox closes", async () => {
    let resolve: (rows: SessionSummary[]) => void = () => {};
    mocks.listLinkedSessions.mockReturnValue(new Promise((done) => (resolve = done)));
    const store = createWorkspaceStore(testWorkspaceState());
    let open = true;
    const { rerender } = mount(() => useInboxLinkedSessions(store, open));
    open = false;
    rerender();

    await act(async () => resolve([{ id: "s" }] as SessionSummary[]));
    expect(store.getState().storedLinkedSessions).toEqual([]);
  });
});

describe("useInboxAskFocus", () => {
  it("focuses the composer only while the Inbox shows an Ask chat", () => {
    const focus = vi.fn();
    const portal = { sessionId: "ask" } as WorkspaceState["inboxAskPortal"];
    let open = false;
    const { rerender } = mount(() => useInboxAskFocus(portal, open, focus));
    expect(focus).not.toHaveBeenCalled();

    open = true;
    rerender();
    expect(focus).toHaveBeenCalledWith(true);
  });
});
