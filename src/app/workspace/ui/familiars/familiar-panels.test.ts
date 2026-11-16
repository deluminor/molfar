// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Familiar } from "@/features/familiars/model/familiar";
import type { FamiliarOverview } from "@/features/familiars/ui/FamiliarOverview";
import type { FamiliarSettingsDialog } from "@/features/familiars/ui/FamiliarSettingsDialog";
import { newDefaultSession } from "@/features/sessions/model/session";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import type { WorkspaceStore } from "../../store/types";
import { fakeWorkspaceHandlers, withWorkspaceHandlers } from "../../testing/workspace-handlers";
import type { FamiliarOverviewData } from "../../hooks/familiars/use-familiar-overview-data";
import { FamiliarOverviewPanel } from "./FamiliarOverviewPanel";
import { FamiliarSettingsPanel } from "./FamiliarSettingsPanel";

const seen = vi.hoisted(() => ({
  overview: undefined as unknown,
  settings: undefined as unknown,
}));
const SessionPaneStub = vi.hoisted(() => () => null);

vi.mock("@/features/familiars/model/familiar", () => ({
  familiarForSession: (sessionId: string) => (sessionId === "familiar-chat" ? familiar : undefined),
  familiarLook: () => ({ name: "Owl" }),
  familiarState: () => ({ status: "idle" }),
}));
vi.mock("@/features/familiars/ui/FamiliarOverview", () => ({
  FamiliarOverview: (props: unknown) => {
    seen.overview = props;
    return null;
  },
}));
vi.mock("@/features/familiars/ui/FamiliarSettingsDialog", () => ({
  FamiliarSettingsDialog: (props: unknown) => {
    seen.settings = props;
    return null;
  },
}));
vi.mock("@/features/sessions/ui/SessionPane", () => ({ SessionPane: SessionPaneStub }));
vi.mock("@/features/familiars/ui/FamiliarActivityView", () => ({ FamiliarActivityView: () => null }));
vi.mock("@/features/window-chrome/ui/WindowControls", () => ({ WindowControls: () => null }));

type OverviewProps = ComponentProps<typeof FamiliarOverview>;
type SettingsProps = ComponentProps<typeof FamiliarSettingsDialog>;
type ActivityStub = { live: boolean; onApproval?: (requestId: number, decision: string) => void };

const familiar: Familiar = vi.hoisted(() => ({
  id: "owl",
  mascot: "owl",
  color: "#fff",
  projects: ["/work/demo"],
}));
const session = { ...newDefaultSession("/work/familiar"), id: "familiar-chat" };

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;
let handlers: ReturnType<typeof fakeWorkspaceHandlers>;

function overviewProps(): OverviewProps {
  return seen.overview as OverviewProps;
}

function settingsProps(): SettingsProps | undefined {
  return seen.settings as SettingsProps | undefined;
}

function overviewData(patch: Partial<FamiliarOverviewData> = {}): FamiliarOverviewData {
  return {
    selectedActivity: undefined,
    activityShownTurnId: undefined,
    cwd: "/work/familiar",
    changeTotals: undefined,
    launches: [],
    documents: [],
    launchedSessions: [],
    ...patch,
  } as FamiliarOverviewData;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
  handlers = fakeWorkspaceHandlers();
  seen.overview = undefined;
  seen.settings = undefined;
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("FamiliarOverviewPanel", () => {
  const noShownSession = {
    session: undefined,
    active: false,
    composerFocused: true,
    composerFocusToken: 0,
    workspaceSwitchingSessionId: undefined,
  };

  function mount(overview = overviewData(), shownSession = noShownSession) {
    act(() =>
      root.render(
        withWorkspaceHandlers(
          createElement(FamiliarOverviewPanel, {
            store,
            familiar,
            session,
            overview,
            sessions: [],
            history: [],
            shownSession,
          }),
          handlers,
        ),
      ),
    );
  }

  it("reads the overview's open state, tab and changes request from the store", () => {
    store.setState({
      familiarOverviewOpen: false,
      familiarOverviewTab: "changes",
      familiarChangesRequest: { path: "a.ts" },
    });
    mount();

    expect(overviewProps()).toMatchObject({
      open: false,
      tab: "changes",
      changes: { sessionId: "familiar-chat", request: { path: "a.ts" }, projects: ["/work/demo"] },
      activity: null,
    });
  });

  it("writes tab, documents, back and close to the store", () => {
    store.setState({ familiarShownSession: "launched", familiarShownSessionFocused: true });
    mount();

    act(() => overviewProps().onTabChange("documents"));
    act(() => overviewProps().onOpenDocument("doc"));
    expect(store.getState()).toMatchObject({
      familiarOverviewTab: "documents",
      familiarShownSession: null,
      familiarOverviewDocument: "doc",
    });
    expect(overviewProps().shownDocumentId).toBe("doc");

    act(() => overviewProps().onBackFromDocument?.());
    store.setState({ familiarShownSession: "launched" });
    act(() => overviewProps().onBackFromSession?.());
    act(() => overviewProps().onClose());
    expect(store.getState()).toMatchObject({
      familiarOverviewDocument: null,
      familiarShownSession: null,
      familiarShownSessionFocused: false,
      familiarOverviewOpen: false,
    });
  });

  it("opens a launched session for this Familiar", () => {
    mount();

    void overviewProps().onOpenSession("launched");

    expect(handlers.familiarView.showLaunchedSession).toHaveBeenCalledWith("familiar-chat", "launched");
  });

  it("shows a launched session's pane beside the chat, its diffs opening there", () => {
    const launched = { ...newDefaultSession("/work/demo"), id: "launched", title: "Fix it" };
    store.setState({ familiarViewId: "familiar-chat" });
    mount(overviewData(), { ...noShownSession, session: launched, active: true });

    const shown = overviewProps().shownSession;
    const pane = shown?.pane as { type: unknown; props: Record<string, unknown> };
    expect(shown?.sessionId).toBe("launched");
    expect(pane.type).toBe(SessionPaneStub);
    expect(pane.props).toMatchObject({
      session: launched,
      visible: true,
      focused: true,
      composerFocused: true,
      addToChatTarget: false,
      onSubmit: handlers.submission.send,
      onOpenDiff: handlers.tabs.openMonoDiff,
      onSecondOpinion: undefined,
      onHandoff: undefined,
    });

    act(() => store.setState({ projectTerminalFocused: true }));
    const unfocused = overviewProps().shownSession?.pane as { props: Record<string, unknown> };
    expect(unfocused.props).toMatchObject({ focused: false, composerFocused: false });
  });

  it("shows the selected turn's activity and answers its approvals in the Familiar's chat", () => {
    mount(overviewData({ selectedActivity: { turnId: "t1", blocks: [], live: true } }));

    const element = overviewProps().activity as { props: ActivityStub };
    const activity = element.props;
    expect(activity.live).toBe(true);
    activity.onApproval?.(7, "accept");
    expect(handlers.turns.approve).toHaveBeenCalledWith("familiar-chat", 7, "accept");
  });
});

describe("FamiliarSettingsPanel", () => {
  function mount(shown: { session: typeof session | undefined } = { session }) {
    act(() =>
      root.render(
        withWorkspaceHandlers(createElement(FamiliarSettingsPanel, { store, session: shown.session }), handlers),
      ),
    );
  }

  it("stays closed unless this Familiar's settings were asked for", () => {
    store.setState({ familiarViewId: "familiar-chat", familiarSettingsFor: "other" });
    mount();

    expect(settingsProps()).toBeUndefined();
  });

  it("stays closed without a Familiar in view or its chat", () => {
    store.setState({ familiarViewId: "familiar-chat", familiarSettingsFor: "owl" });
    mount({ session: undefined });
    expect(settingsProps()).toBeUndefined();

    act(() => store.setState({ familiarViewId: null }));
    mount();
    expect(settingsProps()).toBeUndefined();
  });

  it("binds model changes and reset to the Familiar's chat and closes through the store", () => {
    store.setState({ familiarViewId: "familiar-chat", familiarSettingsFor: "owl" });
    mount();

    const props = settingsProps();
    props?.onModelChange("codex", "gpt");
    void props?.onReset?.();
    expect(handlers.composer.changeModel).toHaveBeenCalledWith("familiar-chat", "codex", "gpt");
    expect(handlers.history.resetFamiliar).toHaveBeenCalledWith("familiar-chat");

    act(() => props?.onClose());
    expect(store.getState().familiarSettingsFor).toBeNull();
  });
});
