// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newDefaultSession } from "@/features/sessions/model/session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { fakeWorkspaceHandlers, withWorkspaceHandlers } from "../../testing/workspace-handlers";
import { InboxAskPanes } from "./InboxAskPanes";

type Seen = Record<string, unknown>;

const seen = vi.hoisted(() => ({ panes: [] as Seen[], surfaces: [] as Seen[] }));

vi.mock("@/features/sessions/ui/SessionPane", () => ({
  SessionPane: (props: Seen) => {
    seen.panes.push(props);
    return null;
  },
}));
vi.mock("@/features/sessions/ui/SessionSurface", () => ({
  SessionSurface: (props: Seen & { children: unknown }) => {
    seen.surfaces.push(props);
    return props.children;
  },
}));

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;
let handlers: ReturnType<typeof fakeWorkspaceHandlers>;

const ask = { ...newDefaultSession("/work/app"), id: "ask", inboxAsk: true };
const chat = { ...newDefaultSession("/work/app"), id: "chat" };

function mount(): void {
  act(() =>
    root.render(
      withWorkspaceHandlers(
        createElement(InboxAskPanes, {
          store,
          sessions: [chat, ask],
          composerFocused: true,
          composerFocusToken: 3,
          workspaceSwitchingSessionId: undefined,
        }),
        handlers,
      ),
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
  handlers = fakeWorkspaceHandlers();
  seen.panes = [];
  seen.surfaces = [];
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("InboxAskPanes", () => {
  it("keeps only Inbox Ask chats mounted, hidden until the inbox shows one", () => {
    mount();

    expect(seen.panes.map((pane) => (pane.session as { id: string }).id)).toEqual(["ask"]);
    expect(seen.panes.at(-1)).toMatchObject({ visible: false, focused: false, composerFocusToken: 3 });
    expect(seen.surfaces.at(-1)?.host).toBeUndefined();
    expect(container.firstElementChild?.className).toBe("hidden");
  });

  it("portals the chat into the inbox's Ask host while the inbox is open", () => {
    const host = document.createElement("div");
    store.setState({ inboxViewOpen: true, inboxAskPortal: { sessionId: "ask", host } });
    mount();

    expect(seen.surfaces.at(-1)?.host).toBe(host);
    expect(seen.panes.at(-1)).toMatchObject({
      visible: true,
      focused: true,
      onSubmit: handlers.submission.send,
    });
  });
});
