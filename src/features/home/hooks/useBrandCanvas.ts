import { useEffect, useRef, useState } from "react";
import {
  advanceBrandTime,
  brandCanvasSize,
  brandVisualStatus,
} from "../model/brand-visual/animation";
import type {
  BrandCanvas,
  BrandCanvasOptions,
  BrandVisualStatus,
} from "../model/brand-visual/types";

/**
 * Drives a brand-visual canvas: paused while hidden or off screen, still under
 * reduced motion. `options` must be referentially stable (a module constant).
 */
export function useBrandCanvas<Theme>(
  options: BrandCanvasOptions<Theme>,
): BrandCanvas {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<BrandVisualStatus>("pending");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = performance.now();
    let seconds = options.stillSeconds;
    let onScreen = true;
    let width = 0;
    let height = 0;
    let theme = options.readTheme(canvas);

    const draw = (): void => {
      options.draw(context, { width, height, seconds, theme });
    };

    const repaintTheme = (): void => {
      theme = options.readTheme(canvas);
      draw();
    };

    const tick = (now: number): void => {
      seconds = advanceBrandTime(seconds, now - last);
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    };

    const sync = (): void => {
      cancelAnimationFrame(frame);

      const rect = canvas.getBoundingClientRect();
      const size = brandCanvasSize(
        rect.width,
        rect.height,
        window.devicePixelRatio,
      );

      width = rect.width;
      height = rect.height;
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);

      if (motion.matches) seconds = options.stillSeconds;
      draw();

      const next = brandVisualStatus({
        hidden: document.hidden,
        reducedMotion: motion.matches,
        onScreen,
        width,
        height,
      });
      setStatus(next);

      last = performance.now();
      if (next === "running") frame = requestAnimationFrame(tick);
    };

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(canvas);

    const intersectionObserver =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting);
            sync();
          });
    intersectionObserver?.observe(canvas);

    // Theme changes must repaint a reduced-motion canvas without starting a loop.
    const themeObserver = new MutationObserver(repaintTheme);
    themeObserver.observe(document.documentElement, { attributes: true });
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    sync();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
      context.clearRect(0, 0, width, height);
    };
  }, [options]);

  return { canvasRef, status };
}
