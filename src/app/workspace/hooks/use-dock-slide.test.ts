// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectTerminalDock } from "@/features/projects/model/project-terminal";
import { useDockSlide, type DockSlideOptions } from "./use-dock-slide";

type Slide = ReturnType<typeof useDockSlide>;

let container: HTMLDivElement;
let root: Root;
let slide: Slide;

function dock(patch: Partial<ProjectTerminalDock> = {}): ProjectTerminalDock {
  return { projectPath: "/work/demo", pane: {} as never, side: "bottom", size: 220, open: true, ...patch };
}

function Probe(options: DockSlideOptions) {
  slide = useDockSlide(options);
  const shown = Boolean(options.dock?.open || slide.closingShown);
  const host = shown
    ? createElement("div", { "data-dock-shown": "" }, createElement("section", null))
    : null;
  return createElement("div", { ref: slide.gridRef }, host);
}

const commitSize = vi.fn();

function mount(patch: Partial<DockSlideOptions> = {}) {
  const options: DockSlideOptions = {
    dock: dock(),
    projectCwd: "/work/demo",
    familiarCovers: false,
    insetLayout: true,
    paintTarget: () => dock(),
    commitSize,
    ...patch,
  };
  act(() => root.render(createElement(Probe, options)));
}

function grid(): HTMLDivElement {
  return container.firstElementChild as HTMLDivElement;
}

function fakeAnimate() {
  const animation = { pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), onfinish: null as (() => void) | null };
  const animate = vi.fn(() => animation);
  Object.defineProperty(grid(), "animate", { value: animate, configurable: true });
  return { animate, animation };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => {
    run();
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  commitSize.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("useDockSlide", () => {
  it("lays the open dock out in the grid without sliding on first show", () => {
    mount();
    expect(grid().style.gridTemplateRows).toBe("minmax(0, 1fr) 220px");
    expect(grid().style.gridTemplateAreas).toBe('"main" "dock"');
  });

  it("slides a dock opened in place from nothing to its size", () => {
    mount({ dock: dock({ open: false }) });
    const { animate, animation } = fakeAnimate();

    mount();

    expect(animate).toHaveBeenCalledWith(
      [{ gridTemplateRows: "minmax(0, 1fr) 0px" }, { gridTemplateRows: "minmax(0, 1fr) 220px" }],
      expect.objectContaining({ duration: 240 }),
    );
    expect(animation.play).toHaveBeenCalled();
  });

  it("keeps a closing dock rendered until its slide finishes", () => {
    mount();
    const { animate, animation } = fakeAnimate();

    mount({ dock: dock({ open: false }) });

    expect(slide.closingShown).toBe(true);
    expect(animate).toHaveBeenCalledWith(
      [{ gridTemplateRows: "minmax(0, 1fr) 220px" }, { gridTemplateRows: "minmax(0, 1fr) 0px" }],
      expect.objectContaining({ duration: 200 }),
    );
    act(() => animation.onfinish?.());
    expect(slide.closingShown).toBe(false);
  });

  it("shows or hides at once in the classic layout", () => {
    mount({ insetLayout: false });
    const { animate } = fakeAnimate();

    mount({ insetLayout: false, dock: dock({ open: false }) });

    expect(animate).not.toHaveBeenCalled();
    expect(slide.closingShown).toBe(false);
    expect(grid().style.gridTemplateAreas).toBe('"main"');
  });

  it("does not slide when switching to another project", () => {
    mount({ dock: dock({ open: false }) });
    const { animate } = fakeAnimate();

    mount({ projectCwd: "/work/other", dock: dock({ projectPath: "/work/other" }) });

    expect(animate).not.toHaveBeenCalled();
  });

  it("hides the dock at once while a Familiar covers the workspace", () => {
    mount();
    const { animate } = fakeAnimate();

    mount({ familiarCovers: true });

    expect(animate).not.toHaveBeenCalled();
    expect(grid().style.gridTemplateAreas).toBe('"main"');
  });

  it("paints a size drag directly and commits it once on release", () => {
    mount();

    act(() => slide.paintSize(300));
    expect(grid().style.gridTemplateRows).toBe("minmax(0, 1fr) 300px");

    act(() => slide.commitSize(300));
    expect(commitSize).toHaveBeenCalledWith(300);
  });

  it("ignores a size drag with nothing to paint", () => {
    mount({ paintTarget: () => undefined });
    act(() => slide.paintSize(300));
    expect(grid().style.gridTemplateRows).toBe("minmax(0, 1fr) 220px");
  });
});
