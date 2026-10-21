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
import type { FamiliarOverviewData } from "../../hooks/familiars/use-familiar-overview-data";
import { FamiliarOverviewPanel } from "./FamiliarOverviewPanel";
import { FamiliarSettingsPanel } from "./FamiliarSettingsPanel";

const seen = vi.hoisted(() => ({
  overview: undefined as unknown,
  settings: undefined as unknown,
}));

vi.mock("@/features/familiars/model/familiar", () => ({
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
vi.mock("@/features/familiars/ui/FamiliarActivityView", () => ({ FamiliarActivityView: () => null }));
vi.mock("@/features/window-chrome/ui/WindowControls", () => ({ WindowControls: () => null }));

type OverviewProps = ComponentProps<typeof FamiliarOverview>;
type SettingsProps = ComponentProps<typeof FamiliarSettingsDialog>;
type ActivityStub = { live: boolean; onApproval?: (requestId: number, decision: string) => void };

const familiar: Familiar = { id: "owl", mascot: "owl", color: "#fff", projects: ["/work/demo"] };
const session = { ...newDefaultSession("/work/familiar"), id: "familiar-chat" };

let container: HTMLDivElement;
let root: Root;
let store: WorkspaceStore;

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
  container = document.createElement("div");
  root = createRoot(container);
  store = createWorkspaceStore(testWorkspaceState());
  seen.overview = undefined;
  seen.settings = undefined;
});

afterEach(() => {
  act(() => root.unmount());
});

describe("FamiliarOverviewPanel", () => {
  const onShowLaunchedSession = vi.fn(async () => {});
  const onApproval = vi.fn();

  function mount(overview = overviewData()) {
    act(() =>
      root.render(
        createElement(FamiliarOverviewPanel, {
          store,
          familiar,
          session,
          overview,
          sessions: [],
          history: [],
          onShowLaunchedSession,
          onOpenSessionInWorkspace: async () => {},
          onApproval,
          onOpenFile: () => {},
          onOpenDiff: () => {},
        }),
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

    expect(onShowLaunchedSession).toHaveBeenCalledWith("familiar-chat", "launched");
  });

  it("shows the selected turn's activity and answers its approvals in the Familiar's chat", () => {
    mount(overviewData({ selectedActivity: { turnId: "t1", blocks: [], live: true } }));

    const element = overviewProps().activity as { props: ActivityStub };
    const activity = element.props;
    expect(activity.live).toBe(true);
    activity.onApproval?.(7, "accept");
    expect(onApproval).toHaveBeenCalledWith("familiar-chat", 7, "accept");
  });
});

describe("FamiliarSettingsPanel", () => {
  const onModelChange = vi.fn();
  const onReset = vi.fn(async () => {});

  function mount() {
    act(() =>
      root.render(
        createElement(FamiliarSettingsPanel, {
          store,
          familiar,
          session,
          onModelChange,
          onModelSettingsChange: () => {},
          onRuntimeModeChange: () => {},
          onReset,
        }),
      ),
    );
  }

  it("stays closed unless this Familiar's settings were asked for", () => {
    store.setState({ familiarSettingsFor: "other" });
    mount();

    expect(settingsProps()).toBeUndefined();
  });

  it("binds model changes and reset to the Familiar's chat and closes through the store", () => {
    store.setState({ familiarSettingsFor: "owl" });
    mount();

    const props = settingsProps();
    props?.onModelChange("codex", "gpt");
    void props?.onReset?.();
    expect(onModelChange).toHaveBeenCalledWith("familiar-chat", "codex", "gpt");
    expect(onReset).toHaveBeenCalledWith("familiar-chat");

    act(() => props?.onClose());
    expect(store.getState().familiarSettingsFor).toBeNull();
  });
});
