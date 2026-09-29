// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DragonCard } from "./DragonCard";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let reducedMotion: boolean;
let hidden: boolean;
let resize: () => void;
let nextFrame: number;
const frames = new Map<number, FrameRequestCallback>();
const motion = new EventTarget();
const draw = vi.fn();
const clear = vi.fn();
const disconnect = vi.fn();
const contextDescriptor = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "getContext",
);
const mediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, "hidden");

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  reducedMotion = false;
  hidden = false;
  nextFrame = 0;
  frames.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
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
    value: () => ({
      clearRect: clear,
      setTransform: vi.fn(),
      fillRect: draw,
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      fillStyle: "",
      globalAlpha: 1,
    }),
  });
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue(new DOMRect(0, 0, 320, 420));
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
  act(() => root.render(createElement(DragonCard)));
}

it("keeps static accessible art and never starts the loop with reduced motion", () => {
  reducedMotion = true;
  renderCard();
  expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  expect(container.querySelectorAll("svg rect").length).toBeGreaterThan(200);
  expect(
    container.querySelector(
      'svg[role="img"] ellipse, svg[role="img"] radialGradient, svg[role="img"] filter',
    ),
  ).toBeNull();
  expect(frames.size).toBe(0);
  expect(draw).not.toHaveBeenCalled();
});

it("stops and clears on visibility and motion changes, then restarts one loop", () => {
  renderCard();
  expect(frames.size).toBe(1);
  hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(frames.size).toBe(0);
  expect(clear).toHaveBeenCalled();
  hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  expect(frames.size).toBe(1);
  reducedMotion = true;
  motion.dispatchEvent(new Event("change"));
  expect(frames.size).toBe(0);
  reducedMotion = false;
  motion.dispatchEvent(new Event("change"));
  expect(frames.size).toBe(1);
});

it("draws equal-sided particles and keeps only one loop after resizing", () => {
  renderCard();
  const start = performance.now();
  for (let frame = 1; frame <= 30; frame++) {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(start + frame * 17));
  }
  expect(draw).toHaveBeenCalled();
  for (const call of draw.mock.calls) expect(call[2]).toBe(call[3]);
  resize();
  expect(frames.size).toBe(1);
});

it("cancels pending work and disconnects observers on unmount", () => {
  renderCard();
  act(() => root.render(null));
  expect(frames.size).toBe(0);
  expect(disconnect).toHaveBeenCalledOnce();
  document.dispatchEvent(new Event("visibilitychange"));
  motion.dispatchEvent(new Event("change"));
  expect(frames.size).toBe(0);
});

it("switches visuals, tears down dragon work and restores the saved choice", () => {
  renderCard();
  expect(frames.size).toBe(1);
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
  });
  const jarvis = container.querySelector<HTMLButtonElement>(
    'button[aria-label="dragon: switch to Jarvis"]',
  );
  act(() => jarvis?.click());
  expect(jarvis?.textContent).toContain("jarvis");
  expect(frames.size).toBe(0);
  expect(container.querySelector('svg[aria-label^="Pixel dragon"]')).toBeNull();
  act(() => root.render(null));
  renderCard();
  expect(
    container.querySelector(".home-brand-selector")?.textContent,
  ).toContain("jarvis");
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="jarvis: switch to Dragon"]',
      )
      ?.click(),
  );
  expect(
    container.querySelector('svg[aria-label^="Pixel dragon"]'),
  ).not.toBeNull();
  expect(
    container.querySelector(".home-brand-selector")?.textContent,
  ).toContain("dragon");
});

it("keeps exactly one active loop when switching both ways repeatedly", () => {
  renderCard();
  for (const visual of ["Jarvis", "Dragon", "Jarvis", "Dragon"]) {
    act(() =>
      container
        .querySelector<HTMLButtonElement>(".home-brand-selector")
        ?.click(),
    );
    expect(frames.size).toBe(1);
    expect(
      container.querySelector(".home-brand-selector")?.textContent,
    ).toContain(visual.toLowerCase());
  }
  act(() => root.render(null));
  expect(frames.size).toBe(0);
});

it("keeps one compact text control and preserves focus while cycling", () => {
  renderCard();
  const button = container.querySelector<HTMLButtonElement>(
    ".home-brand-selector",
  );
  expect(container.querySelectorAll("button")).toHaveLength(1);
  expect(button?.querySelector("svg")).toBeNull();
  expect(button?.textContent).toBe("←dragon→");
  button?.focus();
  act(() => button?.click());
  expect(button?.textContent).toBe("←jarvis→");
  expect(document.activeElement).toBe(button);
  expect(button?.getAttribute("aria-label")).toBe("jarvis: switch to Dragon");
});
