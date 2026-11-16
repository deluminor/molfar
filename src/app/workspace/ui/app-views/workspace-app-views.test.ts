// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppView } from "@/features/workspace/model/app-view-tabs";
import { newDefaultSession } from "@/features/sessions/model/session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { fakeWorkspaceHandlers, withWorkspaceHandlers } from "../../testing/workspace-handlers";
import { saveNotesEnabled } from "@/features/settings/model/settings";
import { WorkspaceAppViews } from "./WorkspaceAppViews";

type Seen = Record<string, Record<string, unknown> | undefined>;

const seen = vi.hoisted((): Seen => ({}));
const jump = vi.hoisted(() => vi.fn());

vi.mock("./lazy-views", () => {
  const view = (name: string) => (props: Record<string, unknown>) => {
    seen[name] = props;
    return null;
  };
  return {
    SearchView: view("search"),
    InboxView: view("inbox"),
    NotesView: view("notes"),
    AutomationsView: view("automations"),
  };
});
vi.mock("@/features/sessions/model/transcript-jump", () => ({ requestTranscriptJump: jump }));

type Props = ComponentProps<typeof WorkspaceAppViews>;

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;
let handlers: ReturnType<typeof fakeWorkspaceHandlers>;

function mount(patch: Partial<Props> = {}) {
  const props: Props = {
    store,
    insetLayout: false,
    openAppViews: [],
    automationsOpen: false,
    besideRail: true,
    compactRail: false,
    gitCwd: "/work/demo",
    sidebarCwd: "/work/demo",
    scopeProject: undefined,
    history: [],
    sessions: [],
    automationsFocusId: undefined,
    inboxAsk: createElement("i", { "data-inbox-ask": "" }),
    localSurfaces: createElement("i", { "data-local": "" }),
    inbox: { sessions: [], repairSessions: new Map() },
    automations: { onFocusAutomationConsumed: () => {}, onLaunch: () => {} },
    ...patch,
  };
  act(() => root.render(withWorkspaceHandlers(createElement(WorkspaceAppViews, props), handlers)));
}

beforeEach(() => {
  saveNotesEnabled(true);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
  handlers = fakeWorkspaceHandlers();
  for (const key of Object.keys(seen)) delete seen[key];
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("WorkspaceAppViews", () => {
  it("mounts only the open view in the classic layout", () => {
    store.setState({ inboxViewOpen: true });
    mount({ openAppViews: ["search", "notes"] });

    expect(Object.keys(seen)).toEqual(["inbox"]);
    expect(seen.inbox).toMatchObject({ active: true, tabbed: false, cwd: "/work/demo" });
  });

  it("keeps tabbed views mounted but inactive in the inset layout", () => {
    const openAppViews: AppView[] = ["search", "notes", "automations"];
    saveNotesEnabled(false);
    mount({ insetLayout: true, openAppViews });

    expect(Object.keys(seen).sort()).toEqual(["automations", "search"]);
    expect(seen.search).toMatchObject({ open: false, tabbed: true });
  });

  it("keeps the slots in place between the views", () => {
    store.setState({ searchViewOpen: true });
    mount({ automationsOpen: true });

    expect(container.querySelector("[data-inbox-ask]")).not.toBeNull();
    expect(container.querySelector("[data-local]")).not.toBeNull();
    expect(Object.keys(seen).sort()).toEqual(["automations", "search"]);
  });

  it("hides Inbox Ask chats from search and jumps to the matched block", () => {
    const ask = { ...newDefaultSession("/work/demo"), id: "ask", inboxAsk: true };
    const chat = { ...newDefaultSession("/work/demo"), id: "chat" };
    store.setState({ searchViewOpen: true });
    mount({ sessions: [ask, chat] });

    expect(seen.search?.sessions).toEqual([chat]);
    const onOpenSession = seen.search?.onOpenSession as (id: string, block?: string, query?: string) => void;
    onOpenSession("chat", "b1", "needle");
    expect(jump).toHaveBeenCalledWith("chat", "b1", "needle");
    expect(handlers.sessionOpeners.selectHistory).toHaveBeenCalledWith("chat");
  });

  it("takes each view's callbacks from the workspace handlers", () => {
    store.setState({ searchViewOpen: true, inboxViewOpen: true, notesViewOpen: true });
    mount({ automationsOpen: true });

    expect(seen.search).toMatchObject({
      onClose: handlers.surfaces.leaveSearch,
      onOpenFile: handlers.files.open,
      onToggleSidebar: handlers.navigation.toggleSidebar,
    });
    expect(seen.inbox).toMatchObject({
      onClose: handlers.surfaces.leaveInbox,
      onAsk: handlers.inboxAsk.ask,
      onOpenSession: handlers.inbox.openSession,
    });
    expect(seen.notes?.onClose).toBe(handlers.surfaces.leaveNotes);
    expect(seen.automations).toMatchObject({
      onClose: handlers.surfaces.leaveAutomations,
      onOpenSession: handlers.surfaces.openConversation,
    });
  });

  it("hands the inbox's Ask host to the store", () => {
    store.setState({ inboxViewOpen: true });
    mount();

    const host = { sessionId: "ask", host: document.createElement("div") };
    const onAskMount = seen.inbox?.onAskMount as (portal: typeof host) => void;
    act(() => onAskMount(host));
    expect(store.getState().inboxAskPortal).toBe(host);
  });
});
