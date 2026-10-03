import { useEffect, useRef, useState } from "react";
import { ORB_MAX_DPR } from "../model/orb/constants";
import { createOrbPoints } from "../model/orb/geometry";
import { drawOrbFrame } from "../model/orb/render";
import type { OrbAnimation } from "../model/orb/types";

export function useOrbAnimation(): OrbAnimation {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const points = createOrbPoints();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = 0;
    let seconds = 0;
    let width = 0;
    let height = 0;

    const draw = (): void => {
      drawOrbFrame(
        context,
        points,
        width,
        height,
        seconds,
        getComputedStyle(canvas).color,
        motion.matches,
      );
    };
    const tick = (now: number): void => {
      if (document.hidden || motion.matches) return;
      seconds += Math.min(Math.max(0, now - last), 100) / 1000;
      last = now;
      draw();
      frame = requestAnimationFrame(tick);
    };

    const sync = (): void => {
      cancelAnimationFrame(frame);
      const rect = canvas.getBoundingClientRect();

      width = rect.width;
      height = rect.height;
      const ratio = Math.min(ORB_MAX_DPR, window.devicePixelRatio || 1);

      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
      setCanvasReady(width > 0 && height > 0);
      last = performance.now();

      if (!document.hidden && !motion.matches && width > 0 && height > 0) {
        frame = requestAnimationFrame(tick);
      }
    };

    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    // Theme changes must repaint a reduced-motion canvas without starting a loop.
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, { attributes: true });
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    sync();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
      context.clearRect(0, 0, width, height);
    };
  }, []);

  return { canvasRef, canvasReady };
}
