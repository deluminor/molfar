import { useEffect, useRef, useState } from "react";
import {
  advanceFireTime,
  fireCanvasSize,
  shouldAnimateFire,
} from "../model/fire/animation";
import { FIRE_STILL_SECONDS } from "../model/fire/constants";
import { drawFireFrame } from "../model/fire/render";
import type {
  FireAnimation,
  FirePalette,
  FireStatus,
} from "../model/fire/types";

function readPalette(canvas: HTMLCanvasElement): FirePalette {
  const style = getComputedStyle(canvas);

  return {
    accent: style.color,
    hot: style.getPropertyValue("--color-content").trim() || "#ebebeb",
  };
}

/** Drives the fire canvas: paused while hidden or off screen, still under reduced motion. */
export function useFireAnimation(): FireAnimation {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<FireStatus>("pending");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = performance.now();
    let seconds = FIRE_STILL_SECONDS;
    let onScreen = true;
    let width = 0;
    let height = 0;
    let palette = readPalette(canvas);

    const draw = (): void => {
      drawFireFrame(context, width, height, seconds, palette);
    };

    const repaintTheme = (): void => {
      palette = readPalette(canvas);
      draw();
    };

    const tick = (now: number): void => {
      seconds = advanceFireTime(seconds, now - last);
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    };

    const sync = (): void => {
      cancelAnimationFrame(frame);

      const rect = canvas.getBoundingClientRect();
      const size = fireCanvasSize(
        rect.width,
        rect.height,
        window.devicePixelRatio,
      );

      width = rect.width;
      height = rect.height;
      if (canvas.width !== size.width) canvas.width = size.width;
      if (canvas.height !== size.height) canvas.height = size.height;
      context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);

      if (motion.matches) seconds = FIRE_STILL_SECONDS;
      draw();
      setStatus(motion.matches ? "still" : "running");

      last = performance.now();
      const animate = shouldAnimateFire({
        hidden: document.hidden,
        reducedMotion: motion.matches,
        onScreen,
        width,
        height,
      });
      if (animate) frame = requestAnimationFrame(tick);
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
  }, []);

  return { canvasRef, status };
}
