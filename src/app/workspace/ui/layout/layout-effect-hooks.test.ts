// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceStore } from "../../store/create-workspace-store";
import { testWorkspaceState } from "../../store/test-state";
import { useChromeResets } from "./use-chrome-resets";
import { useInsetLayoutShell } from "./use-inset-layout-shell";

const mocks = vi.hoisted(() => ({
  applyInsetLayout: vi.fn(),
  invoke: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/features/settings/model/appearance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/settings/model/appearance")>()),
  applyInsetLayout: mocks.applyInsetLayout,
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

afterEach(() => vi.clearAllMocks());

describe("useInsetLayoutShell", () => {
  it("applies the layout setting when it changes", () => {
    let inset = false;
    const { rerender } = mount(() => useInsetLayoutShell(inset));
    rerender();
    inset = true;
    rerender();

    expect(mocks.applyInsetLayout.mock.calls).toEqual([[false], [true]]);
  });

  it("writes the rail width to the shell until the host goes away", () => {
    const shell = document.createElement("div");
    shell.className = "inset-shell";
    const host = document.createElement("div");
    shell.append(host);
    let setHost: (host: HTMLDivElement | null) => void = () => {};
    const { root } = mount(() => {
      setHost = useInsetLayoutShell(true);
    });

    act(() => setHost(host));
    expect(shell.style.getPropertyValue("--inset-rail-width")).toBe(`${host.offsetWidth}px`);

    act(() => root.unmount());
    expect(shell.style.getPropertyValue("--inset-rail-width")).toBe("");
  });
});

describe("useChromeResets", () => {
  it("sends the sidebar back to sessions, unfocuses a hidden dock and shows the traffic lights", () => {
    const store = createWorkspaceStore(testWorkspaceState({ projectTerminalFocused: true }));
    const setSidebarTab = vi.fn();

    mount(() =>
      useChromeResets({ store, sidebarTab: "inbox", setSidebarTab, dockVisible: false }),
    );

    expect(setSidebarTab).toHaveBeenCalledWith("sessions");
    expect(store.getState().projectTerminalFocused).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledWith("set_traffic_lights_visible", { visible: true });
  });

  it("keeps a visible dock's focus and the sessions tab", () => {
    const store = createWorkspaceStore(testWorkspaceState({ projectTerminalFocused: true }));
    const setSidebarTab = vi.fn();

    mount(() =>
      useChromeResets({ store, sidebarTab: "sessions", setSidebarTab, dockVisible: true }),
    );

    expect(setSidebarTab).not.toHaveBeenCalled();
    expect(store.getState().projectTerminalFocused).toBe(true);
  });
});
