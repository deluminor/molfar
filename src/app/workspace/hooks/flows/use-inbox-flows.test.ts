import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import type { LinkedSessionUpdate } from "@/features/inbox/model/linked-session-updates";
import type { WorkspaceTab } from "@/features/workspace/model/layout";
import type { BtwDeps } from "../../flows/btw/btw-actions";
import type { InboxDeps } from "../../flows/inbox/inbox-deps";
import type { LinkedUpdateCardDeps } from "../../flows/linked-work-items/linked-update-card";
import type { WorkspaceStore } from "../../store/types";
import { createInboxFlows, type InboxFlowsInput } from "./use-inbox-flows";

const mocks = vi.hoisted(() => ({
  btw: undefined as BtwDeps | undefined,
  cards: undefined as LinkedUpdateCardDeps | undefined,
  panels: undefined as unknown,
  actions: undefined as unknown,
}));

vi.mock("../../flows/btw/btw-actions", () => ({
  createBtw: (deps: BtwDeps) => {
    mocks.btw = deps;
    return { kind: "btw" };
  },
}));
vi.mock("../../flows/linked-work-items/linked-update-card", () => ({
  createLinkedUpdateCards: (deps: LinkedUpdateCardDeps) => {
    mocks.cards = deps;
    return { kind: "cards" };
  },
}));
vi.mock("../../flows/linked-work-items/linked-work-item-panel", () => ({
  createLinkedWorkItemPanels: (deps: unknown) => {
    mocks.panels = deps;
    return { kind: "panels" };
  },
}));
vi.mock("../../flows/inbox/inbox-actions", () => ({
  createInboxActions: (deps: unknown) => {
    mocks.actions = deps;
    return { kind: "actions" };
  },
}));

afterEach(() => vi.clearAllMocks());

const chat = (id: string): Session => ({ id }) as Session;

function build() {
  const sessionsRef = { current: [chat("a")] };
  const setSessions = vi.fn();
  const persist = vi.fn();
  const inboxDeps: InboxDeps = {
    store: {} as WorkspaceStore,
    sessionsRef,
    setSessions,
    closeAutomations: vi.fn(),
    setSidebarTab: vi.fn(),
    openSessionTab: vi.fn(),
    selectTab: vi.fn(),
    focusComposer: vi.fn(),
    defaultCwd: () => "/p",
    runtimeMode: () => undefined,
    sidebarCwd: () => "/p",
    selectHistorySession: vi.fn(),
    ensureOpenSession: vi.fn(),
    submit: vi.fn(),
  };
  const refs = {
    tabsRef: { current: [] as WorkspaceTab[] },
    activeTabIdRef: { current: "t" },
    projectCwdRef: { current: "/p" },
  };
  const input: InboxFlowsInput = { ...inboxDeps, ...refs, persist };
  return { flows: createInboxFlows(input), inboxDeps, refs, sessionsRef, setSessions, persist };
}

describe("createInboxFlows", () => {
  it("commits side question edits to the latest chats and persists through the lazy persist", () => {
    const { flows, sessionsRef, setSessions, persist } = build();
    const next = [chat("b")];
    mocks.btw?.commitSessions(next);
    mocks.btw?.persist(chat("b"));

    expect(flows.btw).toEqual({ kind: "btw" });
    expect(mocks.btw?.openSessions()).toBe(next);
    expect(sessionsRef.current).toBe(next);
    expect(setSessions).toHaveBeenCalledWith(next);
    expect(persist).toHaveBeenCalledWith(chat("b"));
  });

  it("hands the inbox deps to panels and actions, and the tab refs only to add-to-chat", () => {
    const { flows, inboxDeps, refs } = build();

    expect(mocks.panels).toEqual(inboxDeps);
    expect(mocks.actions).toBe(mocks.panels);
    expect(flows.addToChatDeps).toEqual({ ...inboxDeps, ...refs });
    expect(flows.addToChatDeps.tabsRef).toBe(refs.tabsRef);
    expect([flows.linkedPanels, flows.inboxActions]).toEqual([{ kind: "panels" }, { kind: "actions" }]);
  });

  it("reads the linked updates the render last wrote", () => {
    const { flows, sessionsRef } = build();
    const updates = new Map([["a", {} as LinkedSessionUpdate]]);
    flows.linkedUpdatesRef.current = updates;

    expect(mocks.cards?.linkedUpdates()).toBe(updates);
    expect(mocks.cards?.sessionsRef).toBe(sessionsRef);
  });
});
