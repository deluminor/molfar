// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { fakeWorkspaceHandlers, withWorkspaceHandlers } from "../../testing/workspace-handlers";
import { WorkspaceDialogs } from "./WorkspaceDialogs";
import { WorkspaceNotices } from "./WorkspaceNotices";

type Seen = Record<string, Record<string, unknown> | undefined>;

const { seen, record } = vi.hoisted(() => {
  const seen: Seen = {};
  const record = (name: string) => (props: Record<string, unknown>) => {
    seen[name] = props;
    return null;
  };
  return { seen, record };
});

vi.mock("@/features/providers/ui/HarnessUpdateNotice", () => ({
  HarnessUpdateNotice: record("harness"),
}));
vi.mock("../../../shell/NewLayoutNotice", () => ({
  NewLayoutNotice: record("newLayout"),
}));
vi.mock("@/features/notifications/ui/ResourcePressureNotice", () => ({
  ResourcePressureNotice: record("pressure"),
}));
vi.mock("@/features/sessions/ui/ApprovalToasts", () => ({
  ApprovalToasts: record("toasts"),
}));
vi.mock("@/features/sessions/ui/ReminderNotices", () => ({
  ReminderNotices: record("reminders"),
}));
vi.mock("../../../shell/WhatsNewDialog", () => ({
  WhatsNewDialog: record("whatsNew"),
}));
vi.mock("../../../shell/UpdatePromptDialog", () => ({ UpdatePromptDialog: () => null }));
vi.mock("../../../shell/AppDialog", () => ({ AppDialog: () => null }));
vi.mock("@/features/connections/ui/AddRemoteProjectDialog", () => ({
  AddRemoteProjectDialog: record("remote"),
}));
vi.mock("@/features/sessions/ui/ProviderSignInDialog", () => ({
  ProviderSignInDialog: record("signIn"),
}));

type NoticesProps = ComponentProps<typeof WorkspaceNotices>;

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;
let handlers: ReturnType<typeof fakeWorkspaceHandlers>;

function heightSetter(name: string): (height: number) => void {
  return seen[name]?.onHeightChange as (height: number) => void;
}

beforeEach(() => {
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

describe("WorkspaceNotices", () => {
  function mount() {
    const reminders = {
      due: [],
      error: null,
      open: vi.fn(),
      schedule: vi.fn(),
      cancel: vi.fn(),
      refresh: vi.fn(),
    } as unknown as NoticesProps["reminders"];
    act(() =>
      root.render(
        withWorkspaceHandlers(
          createElement(WorkspaceNotices, {
            pressure: { sessions: { current: [] } },
            approvalNotices: [],
            reminders,
          }),
          handlers,
        ),
      ),
    );
  }

  it("stacks each notice below the shown ones above it", () => {
    mount();
    expect(seen.harness?.topOffset).toBe(12);
    expect(seen.toasts?.topOffset).toBe(12);

    act(() => heightSetter("reminders")(40));
    act(() => heightSetter("harness")(30));
    act(() => heightSetter("newLayout")(20));

    expect(seen.harness?.topOffset).toBe(60);
    expect(seen.newLayout?.topOffset).toBe(98);
    expect(seen.toasts?.topOffset).toBe(126);
  });

  it("opens notification settings from the reminders", () => {
    mount();

    const openSettings = seen.reminders?.onOpenSettings as () => void;
    openSettings();

    expect(handlers.surfaces.openReminderSettings).toHaveBeenCalled();
  });

  it("stops agents and sessions and answers approvals through the handlers", () => {
    mount();

    const stopAgent = seen.pressure?.onStopAgent as (id: string) => void;
    stopAgent("worker-1");

    expect(handlers.turns.stop).toHaveBeenCalledWith("worker-1", true);
    expect(seen.pressure?.onStopSession).toBe(handlers.turns.stop);
    expect(seen.toasts?.onFocusSession).toBe(handlers.workerPanes.openSession);
    expect(seen.toasts?.onApproval).toBe(handlers.turns.approve);
  });
});

describe("WorkspaceDialogs", () => {
  function mount() {
    act(() => root.render(withWorkspaceHandlers(createElement(WorkspaceDialogs, { store }), handlers)));
  }

  it("shows nothing until the store asks for a dialog", () => {
    mount();

    expect(Object.keys(seen)).toEqual([]);
  });

  it("closes What's New and sign-in through the store", () => {
    store.setState({
      whatsNewVersion: "1.0.20",
      providerSignInRequest: { key: "s1:b1", harness: "codex" },
    });
    mount();

    const closeWhatsNew = seen.whatsNew?.onClose as () => void;
    const closeSignIn = seen.signIn?.onClose as () => void;
    act(() => closeWhatsNew());
    act(() => closeSignIn());

    expect(store.getState().whatsNewVersion).toBeNull();
    expect(store.getState().providerSignInRequest).toBeNull();
  });

  it("opens the picked remote project and closes the dialog", () => {
    store.setState({ remoteProjectDialogOpen: true });
    mount();

    const openRemote = seen.remote?.onOpen as (key: string) => void;
    act(() => openRemote("ssh://box/work"));

    expect(handlers.projects.select).toHaveBeenCalledWith("ssh://box/work");
    expect(store.getState().remoteProjectDialogOpen).toBe(false);
  });
});
