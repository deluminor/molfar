// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppView } from "@/features/workspace/model/app-view-tabs";
import { newDefaultSession } from "@/features/sessions/model/session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
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
const onOpenHistorySession = vi.fn();

function mount(patch: Partial<Props> = {}) {
  const props: Props = {
    store,
    insetLayout: false,
    openAppViews: [],
    notesEnabled: true,
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
    onToggleSidebar: () => {},
    onOpenFile: () => {},
    onOpenHistorySession,
    onOpenProject: () => {},
    onLeaveSearch: () => {},
    onLeaveNotes: () => {},
    inbox: {
      onClose: () => {},
      onStart: async () => {},
      onAsk: async () => {},
      onAskRestart: async () => {},
      sessions: [],
      repairSessions: new Map(),
      onRepairChecks: () => {},
      onOpenSession: () => {},
      onOpenIntegrations: () => {},
    },
    automations: {
      onFocusAutomationConsumed: () => {},
      onClose: () => {},
      onLaunch: () => {},
      onOpenSession: () => {},
    },
    ...patch,
  };
  act(() => root.render(createElement(WorkspaceAppViews, props)));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
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
    mount({ insetLayout: true, openAppViews, notesEnabled: false });

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
    expect(onOpenHistorySession).toHaveBeenCalledWith("chat");
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
