// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JarvisVisual } from "./JarvisVisual";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let reduced = false;
let hidden = false;
let resize: () => void;
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
let motion = new EventTarget();
const disconnect = vi.fn();
const arc = vi.fn();
const fill = vi.fn();
const setTransform = vi.fn();

beforeEach(() => {
  motion = new EventTarget();
  reduced = false;
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
  const media = Object.assign(motion, {
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    matches: false,
  });
  Object.defineProperty(media, "matches", {
    configurable: true,
    get: () => reduced,
  });
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(4);
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue(new DOMRect(0, 0, 300, 400));
  const context = document.createElement("canvas").getContext("2d");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    Object.assign(context ?? {}, {
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      clearRect: vi.fn(),
      setTransform,
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      arc,
      fill,
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("renders a complete static SVG when canvas is unavailable", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  await act(async () => root.render(createElement(JarvisVisual)));
  expect(container.querySelectorAll("circle").length).toBeGreaterThan(700);
  expect(container.querySelectorAll("polyline")).toHaveLength(3);
  expect(frames.size).toBe(0);
});

it("draws a complete reduced-motion frame without scheduling animation", async () => {
  reduced = true;
  await act(async () => root.render(createElement(JarvisVisual)));
  expect(arc.mock.calls.length).toBeGreaterThan(700);
  expect(frames.size).toBe(0);
  expect(container.querySelector("svg")).toBeNull();
});

it("caps DPR, pauses hidden work, resizes, and cleans up the loop", async () => {
  await act(async () => root.render(createElement(JarvisVisual)));
  expect(container.querySelector("canvas")?.width).toBe(600);
  expect(setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
  expect(frames.size).toBe(1);
  hidden = true;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(frames.size).toBe(0);
  hidden = false;
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(frames.size).toBe(1);
  await act(async () => resize());
  expect(frames.size).toBe(1);
  await act(async () => root.unmount());
  expect(frames.size).toBe(0);
  expect(disconnect).toHaveBeenCalled();
});

it("removes falling dust when reduced motion is enabled mid-animation", async () => {
  await act(async () => root.render(createElement(JarvisVisual)));
  arc.mockClear();
  fill.mockClear();
  for (let step = 0; step < 12; step += 1) {
    const pending = [...frames.entries()][0];
    frames.delete(pending[0]);
    arc.mockClear();
    fill.mockClear();
    await act(async () => pending[1](performance.now() + (step + 1) * 100));
  }
  const animatedFillCount = fill.mock.calls.length;
  arc.mockClear();
  fill.mockClear();
  reduced = true;
  await act(async () => motion.dispatchEvent(new Event("change")));
  expect(frames.size).toBe(0);
  expect(arc).toHaveBeenCalled();
  expect(fill.mock.calls.length).toBeLessThan(animatedFillCount);
});
