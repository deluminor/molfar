// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRightPanelOpen, loadRightPanelTab } from "@/features/settings/model/appearance";
import { useRightPanel, useRightPanelSlide } from "./use-right-panel";

type Panel = ReturnType<typeof useRightPanel>;

let container: HTMLDivElement;
let root: Root;
let panel: Panel;

function Probe({ shown }: { shown: boolean }) {
  panel = useRightPanel();
  useRightPanelSlide(panel.open, panel.closing, shown, panel.paneRef, panel.setClosing);
  return null;
}

function mount(shown: boolean) {
  act(() => root.render(createElement(Probe, { shown })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("useRightPanel", () => {
  it("starts closed on the files tab", () => {
    mount(true);

    expect(panel.open).toBe(false);
    expect(panel.tab).toBe("files");
  });

  it("show opens the panel on a tab and remembers both", () => {
    mount(true);

    act(() => panel.show("graph"));

    expect(panel.open).toBe(true);
    expect(panel.tab).toBe("graph");
    expect(loadRightPanelOpen()).toBe(true);
    expect(loadRightPanelTab()).toBe("graph");
  });

  it("toggle closes with a closing phase and reopens", () => {
    mount(true);
    act(() => panel.show("files"));

    act(() => panel.toggle());
    expect(panel.open).toBe(false);
    expect(panel.closing).toBe(true);
    expect(loadRightPanelOpen()).toBe(false);

    act(() => panel.toggle());
    expect(panel.open).toBe(true);
    expect(panel.closing).toBe(false);
  });

  it("two toggles in one batch land back where they started", () => {
    mount(true);

    act(() => {
      panel.toggle();
      panel.toggle();
    });

    expect(panel.open).toBe(false);
  });

  it("ends the closing phase at once when the panel is not shown", () => {
    mount(false);
    act(() => panel.show("files"));
    act(() => panel.setPane(document.createElement("div")));
    panel.paneRef.current?.append(document.createElement("div"));

    act(() => panel.toggle());

    expect(panel.closing).toBe(false);
  });
});
