// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRAND_VISUAL_STORAGE_KEY } from "../model/brand-visual/constants";
import { BrandCard } from "./BrandCard";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let storage: Map<string, string>;
let reducedMotion: boolean;
let hidden: boolean;
let intersect: (visible: boolean) => void;
let nextFrame: number;
let context: Record<string, unknown> & { arc: ReturnType<typeof vi.fn> };
const frames = new Map<number, FrameRequestCallback>();
const motion = new EventTarget();
const disconnect = vi.fn();
const contextDescriptor = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "getContext",
);
const mediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");

function canvas2d(): typeof context {
  return {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rotate: vi.fn(),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    fillStyle: "",
    globalAlpha: 1,
  };
}

beforeEach(() => {
  storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  reducedMotion = false;
  hidden = false;
  nextFrame = 0;
  frames.clear();
  context = canvas2d();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = (visible) =>
          act(() => callback([{ isIntersecting: visible }]));
      }
      observe(): void {}
      disconnect = disconnect;
    },
  );
  Object.defineProperty(motion, "matches", {
    configurable: true,
    get: () => reducedMotion,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => motion,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => context,
  });
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue(new DOMRect(0, 0, 320, 240));
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(240);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (contextDescriptor)
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      "getContext",
      contextDescriptor,
    );
  if (mediaDescriptor)
    Object.defineProperty(window, "matchMedia", mediaDescriptor);
  else Reflect.deleteProperty(window, "matchMedia");
  if (hiddenDescriptor)
    Object.defineProperty(document, "hidden", hiddenDescriptor);
  else Reflect.deleteProperty(document, "hidden");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderCard(): void {
  act(() => root.render(createElement(BrandCard)));
}

function selector(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(".home-brand-selector");
}

function fireStatus(): string | null | undefined {
  return container
    .querySelector("[data-fire-status]")
    ?.getAttribute("data-fire-status");
}

function sphereStatus(): string | null | undefined {
  return container
    .querySelector("[data-sphere-status]")
    ?.getAttribute("data-sphere-status");
}

describe("sphere visual", () => {
  beforeEach(() => {
    storage.set(BRAND_VISUAL_STORAGE_KEY, "sphere");
  });

  it("runs exactly one animation loop", () => {
    renderCard();

    expect(
      container.querySelector('[aria-label^="Glass sphere"]'),
    ).not.toBeNull();
    expect(sphereStatus()).toBe("running");
    expect(context.arc).toHaveBeenCalled();
    expect(frames.size).toBe(1);
  });

  it("paints one still frame under reduced motion", () => {
    reducedMotion = true;
    renderCard();

    expect(sphereStatus()).toBe("still");
    expect(context.arc).toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("pauses off screen and resumes with a single loop", () => {
    renderCard();

    intersect(false);
    expect(frames.size).toBe(0);
    expect(sphereStatus()).toBe("paused");

    intersect(true);
    expect(frames.size).toBe(1);
    expect(sphereStatus()).toBe("running");
  });
});

describe("fire visual", () => {
  it("is the default and runs exactly one animation loop", () => {
    renderCard();

    expect(container.querySelector('[aria-label^="Campfire"]')).not.toBeNull();
    expect(fireStatus()).toBe("running");
    expect(context.arc).toHaveBeenCalled();
    expect(frames.size).toBe(1);
  });

  it("advances one loop per frame", () => {
    renderCard();
    const initial = [...context.arc.mock.calls];
    const start = performance.now();

    for (let frame = 1; frame <= 5; frame++) {
      const pending = [...frames.values()];
      frames.clear();
      context.arc.mockClear();
      pending.forEach((callback) => callback(start + frame * 16));
    }

    expect(frames.size).toBe(1);
    expect(context.arc.mock.calls).not.toEqual(initial);
  });

  it("paints one still frame under reduced motion", () => {
    reducedMotion = true;
    renderCard();

    expect(fireStatus()).toBe("still");
    expect(context.arc).toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("pauses while hidden or off screen and resumes with a single loop", () => {
    renderCard();

    hidden = true;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(frames.size).toBe(0);
    expect(fireStatus()).toBe("paused");

    hidden = false;
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(frames.size).toBe(1);

    intersect(false);
    expect(frames.size).toBe(0);

    intersect(true);
    expect(frames.size).toBe(1);
  });

  it("cancels work and disconnects observers on unmount", () => {
    renderCard();

    act(() => root.render(null));

    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(frames.size).toBe(0);
  });
});

describe("visual selector", () => {
  it("cycles fire, orb and sphere, keeping focus and one compact control", () => {
    renderCard();
    const button = selector();

    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(button?.textContent).toBe("←fire→");
    expect(button?.getAttribute("aria-label")).toBe("fire: switch to Orb");

    button?.focus();
    act(() => button?.click());

    expect(selector()?.textContent).toBe("←orb→");
    expect(document.activeElement).toBe(selector());
    expect(selector()?.getAttribute("aria-label")).toBe("orb: switch to Sphere");
    expect(container.querySelector('[aria-label^="Campfire"]')).toBeNull();

    act(() => selector()?.click());
    expect(selector()?.getAttribute("aria-label")).toBe(
      "sphere: switch to Fire",
    );
    expect(container.querySelector('[aria-label^="Orb"]')).toBeNull();
  });

  it("persists the choice and restores it after remount", () => {
    renderCard();
    act(() => selector()?.click());

    expect(storage.get(BRAND_VISUAL_STORAGE_KEY)).toBe("orb");

    act(() => root.render(null));
    renderCard();

    expect(selector()?.textContent).toBe("←orb→");
  });

  it("falls back to fire for an unknown stored preference", () => {
    storage.set(BRAND_VISUAL_STORAGE_KEY, "dragon");
    renderCard();

    expect(selector()?.textContent).toBe("←fire→");
  });

  it("keeps exactly one active loop while cycling every visual", () => {
    renderCard();

    for (const visual of ["orb", "sphere", "fire", "orb"]) {
      act(() => selector()?.click());
      expect(frames.size).toBe(1);
      expect(selector()?.textContent).toContain(visual);
    }

    act(() => root.render(null));
    expect(frames.size).toBe(0);
  });
});
