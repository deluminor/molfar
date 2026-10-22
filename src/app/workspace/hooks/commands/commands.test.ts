// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { CommandDeps, OpenSurfaces, WorkspaceActions } from "./command-deps";
import { handleTabCommandKey } from "./tab-command-key";
import { zoomUi } from "./ui-zoom";

vi.mock("@/features/settings/model/ui-scale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/settings/model/ui-scale")>()),
  applyUiScale: vi.fn(async () => undefined),
}));

const closedSurfaces: OpenSurfaces = {
  search: false,
  inbox: false,
  notes: false,
  automations: false,
  settings: false,
  filePicker: false,
  whatsNew: false,
  insetLayout: false,
};

function setup(surfaces: Partial<OpenSurfaces> = {}) {
  const actions = {
    onNewFocused: vi.fn(),
    onArchiveFocusedSession: vi.fn(),
    onCloseOtherTabs: vi.fn(),
    onCloseAllTabs: vi.fn(),
    onCloseFocused: vi.fn(),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onVisitBack: vi.fn(),
    onVisitForward: vi.fn(),
    onActivate: vi.fn(),
    onSplit: vi.fn(),
    onFocusDir: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleSessionSidebar: vi.fn(),
    onToggleFamiliar: vi.fn(),
    onGoToFile: vi.fn(),
    onOpenCommandPalette: vi.fn(),
    onReload: vi.fn(),
    onFindInProject: vi.fn(),
    onOpenSearch: vi.fn(),
    onOpenInbox: vi.fn(),
    onOpenNotes: vi.fn(),
    onNewTerminal: vi.fn(),
    onNewTerminalTab: vi.fn(),
    onToggleProjectTerminal: vi.fn(),
    onNavigateSessionList: vi.fn(),
    onNavigateProjectList: vi.fn(),
    openSettings: vi.fn(),
    onOpenApprovalSession: vi.fn(),
    onOpenBoardCard: vi.fn(),
    pickProject: vi.fn(async () => undefined),
  } satisfies WorkspaceActions;
  const deps = {
    actions: { current: actions },
    run: vi.fn((_name: string, fn: () => void) => fn()),
    surfaces: () => ({ ...closedSurfaces, ...surfaces }),
    sessions: () => [],
    isMainWindow: () => true,
  } satisfies CommandDeps;
  return { deps, actions };
}

function key(init: KeyboardEventInit, target: Element = document.body): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { cancelable: true, bubbles: true, ...init });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

describe("tab command keys", () => {
  it("cycles tabs on Ctrl+Tab", () => {
    const { deps, actions } = setup();

    expect(handleTabCommandKey(deps, key({ key: "Tab", ctrlKey: true }))).toBe(true);

    expect(actions.onNext).toHaveBeenCalled();
  });

  it("ignores keys that are not tab commands", () => {
    const { deps } = setup();

    expect(handleTabCommandKey(deps, key({ key: "a" }))).toBe(false);
    expect(deps.run).not.toHaveBeenCalled();
  });

  it("opens a terminal on Ctrl+`", () => {
    const { deps, actions } = setup();

    handleTabCommandKey(deps, key({ key: "`", code: "Backquote", ctrlKey: true }));

    expect(actions.onNewTerminal).toHaveBeenCalled();
  });
});

describe("zoomUi", () => {
  it("steps the UI scale and resets it", () => {
    zoomUi("zoom-reset");
    const base = Number(localStorage.getItem("molfar.uiScale") ?? "1");

    zoomUi("zoom-in");
    expect(Number(localStorage.getItem("molfar.uiScale"))).toBeGreaterThan(base);

    zoomUi("zoom-reset");
    expect(Number(localStorage.getItem("molfar.uiScale") ?? "1")).toBe(base);
  });
});
