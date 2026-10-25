// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domain/session/session";
import {
  useActiveHarnessCatalog,
  useBtwAbortClosed,
  useForegroundFlush,
  useHarnessIdlePark,
  useWarmActiveSkills,
} from "./use-harness-effects";

const mocks = vi.hoisted(() => ({
  configureHarnessIdlePark: vi.fn(),
  refreshHarnessCatalogs: vi.fn(async () => undefined),
  warmNativeSkills: vi.fn(),
}));

vi.mock("@/integrations/harness", () => ({
  configureHarnessIdlePark: mocks.configureHarnessIdlePark,
  refreshHarnessCatalogs: mocks.refreshHarnessCatalogs,
  isLiveHarness: (harness: string) => harness !== "fake",
}));
vi.mock("@/features/skills/model/skills", () => ({ warmNativeSkills: mocks.warmNativeSkills }));
vi.mock("@/features/sessions/model/session-skills", () => ({
  nativeSkillContextForSession: (session: Session) =>
    session.harness === "claude" ? { harness: session.harness, cwd: session.cwd } : null,
}));

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

function mount(hook: () => void) {
  function Probe() {
    hook();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return () => act(() => root.render(createElement(Probe)));
}

const session = (id: string, harness = "claude", cwd = "/p"): Session =>
  ({ id, harness, cwd }) as unknown as Session;

afterEach(() => vi.clearAllMocks());

describe("useBtwAbortClosed", () => {
  it("passes the open chat ids on each sessions change", () => {
    const btw = { abortClosed: vi.fn() };
    let sessions = [session("a")];
    const rerender = mount(() => useBtwAbortClosed(btw, sessions));
    rerender();
    sessions = [session("b")];
    rerender();

    expect(btw.abortClosed.mock.calls).toEqual([[new Set(["a"])], [new Set(["b"])]]);
  });
});

describe("useHarnessIdlePark", () => {
  it("parks idle CLIs, keeping the foreground ones", () => {
    const isForeground = vi.fn();
    mount(() => useHarnessIdlePark({ isForeground }));

    expect(mocks.configureHarnessIdlePark).toHaveBeenCalledWith({
      limit: expect.any(Function),
      keep: isForeground,
    });
  });
});

describe("useWarmActiveSkills", () => {
  it("warms skills once per active chat with native commands", () => {
    let active: Session | undefined = session("a");
    const rerender = mount(() => useWarmActiveSkills(active));
    rerender();
    active = session("b", "fake");
    rerender();
    active = undefined;
    rerender();

    expect(mocks.warmNativeSkills.mock.calls).toEqual([[{ harness: "claude", cwd: "/p" }]]);
  });
});

describe("useActiveHarnessCatalog", () => {
  it("refreshes a live active harness's catalog when the harness changes", () => {
    let harness: string | undefined = "claude";
    const rerender = mount(() => useActiveHarnessCatalog(harness as Session["harness"]));
    rerender();
    harness = "fake";
    rerender();
    harness = "codex";
    rerender();

    expect(mocks.refreshHarnessCatalogs.mock.calls).toEqual([[["claude"]], [["codex"]]]);
  });
});

describe("useForegroundFlush", () => {
  it("flushes when what is shown changes", () => {
    const flush = vi.fn();
    const shown = {
      activeTabId: "t1",
      familiarViewId: null,
      inboxViewOpen: false,
      inboxAskSessionId: undefined,
      shownFamiliarSessionId: undefined,
      searchViewOpen: false,
      notesViewOpen: false,
      automationsViewOpen: false,
      settingsOpen: false,
    };
    let current = shown;
    const rerender = mount(() => useForegroundFlush(flush, current));
    rerender();
    current = { ...shown, activeTabId: "t2" };
    rerender();

    expect(flush).toHaveBeenCalledTimes(2);
  });
});
