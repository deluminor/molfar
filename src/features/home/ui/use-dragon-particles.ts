import { useEffect, useRef, type RefObject } from "react";
import { DRAGON_DOTS, dragonEmitters, dragonTransform } from "../model/dragon";
import {
  advanceDragonParticles,
  dragonParticleOpacity,
} from "../model/dragon-particles";
import type { DragonParticleState } from "../model/dragon-types";
import { shouldAnimateMatrix } from "../model/matrix";

/** Animate the decorative overlay without React updates or hidden-page work. */
export function useDragonParticles(): RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const emitters = dragonEmitters(DRAGON_DOTS);
    let context: CanvasRenderingContext2D | null = canvas.getContext("2d");
    let state: DragonParticleState = { particles: [], remainder: 0 };
    let frame = 0;
    let last = 0;
    let width = 0;
    let height = 0;
    let transform = dragonTransform(0, 0);

    const clear = (): void => {
      context?.clearRect(0, 0, width, height);
    };

    const tick = (now: number): void => {
      if (!context) return;
      clear();
      if (!shouldAnimateMatrix(motion.matches, document.hidden)) return;
      state = advanceDragonParticles(state, (now - last) / 1000, emitters);
      last = now;
      context.fillStyle = getComputedStyle(canvas).color;
      for (const particle of state.particles) {
        const size = particle.size * transform.scale;
        context.globalAlpha = dragonParticleOpacity(particle);
        context.fillRect(
          transform.x + particle.x * transform.scale - size / 2,
          transform.y + particle.y * transform.scale - size / 2,
          size,
          size,
        );
      }
      context.globalAlpha = 1;
      frame = requestAnimationFrame(tick);
    };

    const sync = (): void => {
      cancelAnimationFrame(frame);
      state = { particles: [], remainder: 0 };
      if (!context) {
        context = canvas.getContext("2d");
        if (!context) return;
      }
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      transform = dragonTransform(width, height);
      clear();
      last = performance.now();
      if (
        width > 0 &&
        height > 0 &&
        shouldAnimateMatrix(motion.matches, document.hidden)
      ) {
        frame = requestAnimationFrame(tick);
      }
    };

    const observer = new ResizeObserver(sync);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
      clear();
    };
  }, []);

  return canvasRef;
}
